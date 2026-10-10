"""Checklist Blitz API and daily WhatsApp dispatcher (Python standard library).

Requires an always-on Python host and a persistent CHECKLIST_DB_PATH.
No credentials or phone numbers are stored in this source file.
"""

import hmac
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, request
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


try:
    TZ = ZoneInfo("America/Sao_Paulo")
except ZoneInfoNotFoundError:
    # Windows installations can lack IANA data. Install tzdata for full rules.
    TZ = timezone(timedelta(hours=-3))
DB_PATH = os.environ.get("CHECKLIST_DB_PATH", "checklist.db")
ADMIN_TOKEN = os.environ.get("CHECKLIST_ADMIN_TOKEN", "")
ALLOWED_ORIGIN = os.environ.get("CHECKLIST_SITE_ORIGIN", "https://robson-blixx.github.io").rstrip("/")
PHONE_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
TEMPLATE = os.environ.get("WHATSAPP_TEMPLATE_NAME", "")
TEMPLATE_LANG = os.environ.get("WHATSAPP_TEMPLATE_LANG", "pt_BR")
ADMIN_PHONE = re.sub(r"\D", "", os.environ.get("CHECKLIST_ADMIN_PHONE", ""))
GRAPH_VERSION = os.environ.get("WHATSAPP_GRAPH_VERSION", "v23.0")
DEFAULT_ALERT_DAYS = 5
OPERATIONS = {"Jet": 20, "Total": 15}
TYPOLOGIES = {"3/4", "Toco", "Truck", "Cavalo/Carreta", "Fiorino", "Van", "VUC"}


def connect():
    db = sqlite3.connect(DB_PATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS deliveries (record_id TEXT NOT NULL, due_date TEXT NOT NULL, recipient TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY(record_id, due_date, recipient))")
    db.execute("CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
    db.commit()
    return db


def clean_phone(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return "55" + digits if len(digits) in (10, 11) else digits


def validate_record(data):
    if not isinstance(data, dict):
        raise ValueError("Cadastro inválido")
    if data.get("operation") not in OPERATIONS or data.get("typology") not in TYPOLOGIES:
        raise ValueError("Operação ou tipologia inválida")
    try:
        issued = date.fromisoformat(data.get("issuedAt", ""))
    except (TypeError, ValueError):
        raise ValueError("Data de emissão inválida") from None
    name = str(data.get("driverName", "")).strip()[:90]
    plate = str(data.get("plate", "")).strip().upper()[:8]
    if not name or not plate:
        raise ValueError("Motorista e placa são obrigatórios")
    driver_phone = clean_phone(data.get("driverPhone"))
    if not 12 <= len(driver_phone) <= 13:
        raise ValueError("WhatsApp do motorista inválido")
    return {
        "id": str(data.get("id") or uuid.uuid4()),
        "operation": data["operation"], "driverName": name,
        "driverPhone": driver_phone, "plate": plate,
        "issuedAt": issued.isoformat(), "typology": data["typology"],
        "tracker": str(data.get("tracker", ""))[:50],
    }


def due_date(record):
    return date.fromisoformat(record["issuedAt"]) + timedelta(days=OPERATIONS[record["operation"]])


def get_alert_days(db):
    row = db.execute("SELECT value FROM settings WHERE name='alert_days'").fetchone()
    return int(row["value"]) if row else DEFAULT_ALERT_DAYS


def alert_date(record, days):
    return due_date(record) - timedelta(days=days)


def send_template(phone, record):
    """Approved template body parameters: driver name, operation, due date."""
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{PHONE_ID}/messages"
    body = {
        "messaging_product": "whatsapp", "to": phone, "type": "template",
        "template": {"name": TEMPLATE, "language": {"code": TEMPLATE_LANG},
            "components": [{"type": "body", "parameters": [
                {"type": "text", "text": record["driverName"]},
                {"type": "text", "text": record["operation"]},
                {"type": "text", "text": due_date(record).strftime("%d/%m/%Y")},
            ]}]},
    }
    req = request.Request(url, data=json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}, method="POST")
    with request.urlopen(req, timeout=20) as response:
        result = json.load(response)
    if not result.get("messages"):
        raise RuntimeError("A Meta não confirmou o envio")


def dispatch_due_alerts(today=None):
    """Sends once per recipient and checklist alert date; safe to rerun daily."""
    if not (PHONE_ID and ACCESS_TOKEN and TEMPLATE and ADMIN_PHONE):
        return {"ready": False, "sent": 0}
    today = today or datetime.now(TZ).date()
    sent = 0
    with closing(connect()) as db:
        records = [json.loads(row["data"]) for row in db.execute("SELECT data FROM records")]
        days = get_alert_days(db)
        for record in records:
            if not (alert_date(record, days) <= today <= due_date(record)):
                continue
            recipients = list(dict.fromkeys(filter(None, [record["driverPhone"], ADMIN_PHONE])))
            for phone in recipients:
                exists = db.execute("SELECT 1 FROM deliveries WHERE record_id=? AND due_date=? AND recipient=?",
                                    (record["id"], due_date(record).isoformat(), phone)).fetchone()
                if exists:
                    continue
                try:
                    send_template(phone, record)
                except (error.HTTPError, error.URLError, TimeoutError, RuntimeError) as exc:
                    print(f"Falha no aviso do cadastro {record['id']}: {type(exc).__name__}", flush=True)
                    continue
                db.execute("INSERT INTO deliveries VALUES (?,?,?,?)", (record["id"], due_date(record).isoformat(), phone, datetime.now(TZ).isoformat()))
                db.commit()
                sent += 1
    return {"ready": True, "sent": sent}


def scheduler():
    last_day = None
    while True:
        now = datetime.now(TZ)
        if now.hour >= 9 and now.date() != last_day:
            dispatch_due_alerts(now.date())
            last_day = now.date()
        time.sleep(60)


class Handler(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if self.headers.get("Origin") == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.end_headers()

    def _json(self, status, value):
        self._headers(status)
        self.wfile.write(json.dumps(value, ensure_ascii=False).encode())

    def _authorized(self):
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        return bool(ADMIN_TOKEN) and hmac.compare_digest(supplied, ADMIN_TOKEN)

    def do_OPTIONS(self):
        if self.headers.get("Origin") != ALLOWED_ORIGIN:
            return self._json(403, {"error": "Origem não permitida"})
        self._headers(204)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            return self._json(200, {"ok": True, "whatsappReady": bool(PHONE_ID and ACCESS_TOKEN and TEMPLATE and ADMIN_PHONE)})
        if path not in ("/records", "/settings"):
            return self._json(404, {"error": "Não encontrado"})
        if not self._authorized():
            return self._json(401, {"error": "Acesso negado"})
        with closing(connect()) as db:
            if path == "/settings":
                return self._json(200, {"alertDays": get_alert_days(db)})
            rows = [json.loads(row["data"]) for row in db.execute("SELECT data FROM records")]
            for record in rows:
                sent_to = {row["recipient"] for row in db.execute(
                    "SELECT recipient FROM deliveries WHERE record_id=? AND due_date=?",
                    (record["id"], due_date(record).isoformat()))}
                expected = {record["driverPhone"], ADMIN_PHONE}
                record["alertSent"] = bool(ADMIN_PHONE) and expected.issubset(sent_to)
        self._json(200, rows)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path not in ("/records", "/settings") or not self._authorized():
            return self._json(401, {"error": "Acesso negado"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                raise ValueError("Arquivo grande demais")
            incoming = json.loads(self.rfile.read(length))
            if path == "/settings":
                days = incoming.get("alertDays")
                if type(days) is not int or not 0 <= days <= 20:
                    raise ValueError("Escolha de 0 a 20 dias antes do vencimento")
                with closing(connect()) as db:
                    db.execute("INSERT OR REPLACE INTO settings VALUES ('alert_days', ?)", (str(days),))
                    db.commit()
                return self._json(200, {"alertDays": days})
            records = [validate_record(item) for item in incoming]
            if len(records) > 10000 or len({r["id"] for r in records}) != len(records):
                raise ValueError("Lista inválida")
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            return self._json(400, {"error": str(exc)})
        with closing(connect()) as db:
            db.execute("DELETE FROM records")
            db.executemany("INSERT INTO records VALUES (?,?)", [(r["id"], json.dumps(r, ensure_ascii=False)) for r in records])
            db.commit()
        self._json(200, {"saved": len(records)})


if __name__ == "__main__":
    if not ADMIN_TOKEN:
        raise SystemExit("Defina CHECKLIST_ADMIN_TOKEN antes de iniciar o servidor")
    connect().close()
    threading.Thread(target=scheduler, daemon=True).start()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Checklist Blitz API na porta {port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
