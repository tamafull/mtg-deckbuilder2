#!/usr/bin/env python3
"""Convert MTGJSON AllPrintings.sqlite into compact D1 import SQL.

The source of truth remains MTGJSON's SQLite database. Only fields needed by the
Site are projected into D1. Japanese foreignData is retained with its own
Scryfall identifier so the UI can show Japanese printed card images.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12,
}


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')}


def col(cols: set[str], name: str, fallback: str = "NULL", alias: str = "c") -> str:
    return f'{alias}."{name}"' if name in cols else fallback


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def json_array(value: Any) -> str:
    if value is None or value == "":
        return "[]"
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
        except json.JSONDecodeError:
            pass
        return json.dumps([value], ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "[]"


def deck_limit(text: str | None, alternative: Any) -> int | None:
    if not alternative:
        return None
    t = text or ""
    if re.search(r"deck can have any number of cards named", t, re.I):
        return 99
    m = re.search(r"deck can have up to (\d+) cards named", t, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"deck can have up to (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) cards named", t, re.I)
    if m:
        return NUMBER_WORDS[m.group(1).lower()]
    return 99


def parse_identifiers(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        value = json.loads(str(raw))
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def chunks_writer(output_dir: Path, max_bytes: int):
    output_dir.mkdir(parents=True, exist_ok=True)
    index = 0
    fp = None
    size = 0

    def write(statement: str):
        nonlocal index, fp, size
        encoded = statement.encode("utf-8")
        if fp is None or (size and size + len(encoded) > max_bytes):
            if fp:
                fp.close()
            path = output_dir / f"mtgjson-{index:04d}.sql"
            fp = path.open("w", encoding="utf-8", newline="\n")
            fp.write("PRAGMA foreign_keys=OFF;\n")
            size = len("PRAGMA foreign_keys=OFF;\n".encode())
            index += 1
        fp.write(statement)
        size += len(encoded)

    def close():
        if fp:
            fp.close()

    return write, close


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sqlite", type=Path, help="MTGJSON AllPrintings.sqlite")
    parser.add_argument("--out", type=Path, default=Path(".mtgjson-d1"))
    parser.add_argument("--chunk-mb", type=int, default=8)
    args = parser.parse_args()

    conn = sqlite3.connect(f"file:{args.sqlite.resolve()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"cards", "cardIdentifiers", "cardLegalities", "cardForeignData"}
    missing = required - tables
    if missing:
        raise SystemExit(f"Unexpected MTGJSON schema; missing: {', '.join(sorted(missing))}")

    cards_cols = table_columns(conn, "cards")
    ids_cols = table_columns(conn, "cardIdentifiers")
    legal_cols = table_columns(conn, "cardLegalities")
    foreign_cols = table_columns(conn, "cardForeignData")

    select = f"""
      SELECT
        {col(cards_cols,'uuid')} AS uuid,
        {col(cards_cols,'name')} AS name,
        {col(cards_cols,'manaCost')} AS manaCost,
        {col(cards_cols,'manaValue','0')} AS manaValue,
        {col(cards_cols,'type',"''")} AS typeLine,
        {col(cards_cols,'text',"''")} AS oracleText,
        {col(cards_cols,'colors',"'[]'")} AS colors,
        {col(cards_cols,'colorIdentity',"'[]'")} AS colorIdentity,
        {col(cards_cols,'rarity')} AS rarity,
        {col(cards_cols,'setCode')} AS setCode,
        {col(cards_cols,'number')} AS collectorNumber,
        {col(cards_cols,'power')} AS power,
        {col(cards_cols,'toughness')} AS toughness,
        {col(cards_cols,'loyalty')} AS loyalty,
        {col(cards_cols,'hasAlternativeDeckLimit','0')} AS hasAlternativeDeckLimit,
        {col(ids_cols,'scryfallId','NULL','i')} AS scryfallId,
        {col(ids_cols,'scryfallOracleId','NULL','i')} AS oracleId
      FROM cards c
      LEFT JOIN cardIdentifiers i ON i.uuid=c.uuid
      WHERE ({col(cards_cols,'availability',"'paper'")} LIKE '%paper%' OR {col(cards_cols,'availability',"'paper'")} IS NULL)
    """

    legal_fields = [x for x in ("commander", "brawl", "legacy", "modern", "pauper", "pioneer", "standard", "vintage") if x in legal_cols]
    legal_by_uuid: dict[str, dict[str, str]] = {}
    if legal_fields:
        q = 'SELECT uuid,' + ','.join(f'"{x}"' for x in legal_fields) + ' FROM cardLegalities'
        for row in conn.execute(q):
            legal_by_uuid[str(row["uuid"])] = {x: row[x] for x in legal_fields if row[x] is not None}

    japanese_by_uuid: dict[str, list[dict[str, Any]]] = {}
    f_fields = [x for x in ("uuid", "language", "name", "faceName", "text", "type", "identifiers", "scryfallId", "multiverseId") if x in foreign_cols]
    q = 'SELECT ' + ','.join(f'"{x}"' for x in f_fields) + ' FROM cardForeignData WHERE language=?'
    for row in conn.execute(q, ("Japanese",)):
        data = dict(row)
        identifiers = parse_identifiers(data.get("identifiers"))
        data["scryfallId"] = data.get("scryfallId") or identifiers.get("scryfallId")
        data["multiverseId"] = data.get("multiverseId") or identifiers.get("multiverseId")
        japanese_by_uuid.setdefault(str(data["uuid"]), []).append(data)

    write, close = chunks_writer(args.out, args.chunk_mb * 1024 * 1024)
    write("DELETE FROM mtg_card_names;\nDELETE FROM mtg_cards;\n")
    count = 0
    japanese_count = 0
    for row in conn.execute(select):
        uuid = str(row["uuid"])
        name = str(row["name"])
        type_line = row["typeLine"] or ""
        text = row["oracleText"] or ""
        colors = json_array(row["colors"])
        identity = json_array(row["colorIdentity"])
        legalities = json.dumps(legal_by_uuid.get(uuid, {}), ensure_ascii=False, separators=(",", ":"))
        basic = 1 if "Basic Land" in type_line else 0
        limit = deck_limit(text, row["hasAlternativeDeckLimit"])
        values = [uuid,name,None,"English",row["manaCost"],row["manaValue"] or 0,type_line,text,colors,identity,row["rarity"],row["setCode"],row["collectorNumber"],row["scryfallId"],row["oracleId"],row["power"],row["toughness"],row["loyalty"],legalities,None,basic,limit,name.casefold()]
        write("INSERT OR REPLACE INTO mtg_cards (uuid,name,face_name,language,mana_cost,mana_value,type_line,oracle_text,colors,color_identity,rarity,set_code,collector_number,scryfall_id,oracle_id,power,toughness,loyalty,legalities,image_url,is_basic,deck_limit,normalized_name) VALUES (" + ",".join(sql_literal(v) for v in values) + ");\n")
        for f in japanese_by_uuid.get(uuid, []):
            jname = f.get("name") or name
            jvalues = [uuid,"Japanese",jname,str(jname).casefold(),f.get("type") or type_line,f.get("text") or text,f.get("uuid"),f.get("scryfallId"),f.get("multiverseId"),None]
            write("INSERT OR IGNORE INTO mtg_card_names (card_uuid,language,name,normalized_name,type_line,oracle_text,foreign_uuid,scryfall_id,multiverse_id,image_url) VALUES (" + ",".join(sql_literal(v) for v in jvalues) + ");\n")
            japanese_count += 1
        count += 1
    close()
    print(f"Exported {count} MTGJSON printings and {japanese_count} Japanese localized rows to {args.out}")


if __name__ == "__main__":
    main()
