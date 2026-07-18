#!/usr/bin/env python3
"""
Sync assets/hot-availability.json from the live "I AM + House of Transformation"
Google Calendar. Runs unattended from .github/workflows/hot-availability-sync.yml.

AUTH: a service-account JSON in env GOOGLE_SA_JSON (a GitHub Actions secret), shared
to the calendar with "See all event details". Locally it falls back to
GOOGLE_SA_FILE, else ../../hot-calendar-reader.json. Reads via the Calendar REST API
directly (no discovery doc, so no slow/hanging build()).

VENUE FILTER — block a date only when the event is clearly at the Ortigas venue:
  BLOCK if:
    - location contains "house of transformation", OR
    - summary contains "rental" or "pencil", OR
    - summary names a core Manila program (Discovery / Breakthrough / Awakening /
      PMP / Seven AI) AND has no off-site city AND isn't online.
  SKIP: off-site cities (Bacolod/Davao/Cebu/Cavite/...), online/Meet, birthdays,
  Abundance Deep Dives, FACI-ED, and anything else with no venue marker.
Every decision is printed so a human can audit the Action's run log.

Only rewrites the JSON when the *booked set* actually changes, so a routine run with
no booking changes produces no commit and no redeploy.
"""
import os, json, datetime, urllib.request, urllib.parse
from google.oauth2 import service_account
from google.auth.transport.requests import Request

CAL = "iampluscoachingsystem@gmail.com"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "assets", "hot-availability.json"))
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
SOURCE = "I AM + House of Transformation calendar (venue-only filter)"
MONTHS_AHEAD = 12

CORE_PROGRAMS = ["discovery", "breakthrough", "awakening", "pmp", "seven ai"]
OFFSITE = ["bacolod", "davao", "cebu", "dubai", "bacoor", "cavite", "iloilo",
           "cdo", "cagayan de oro", "online", "zoom", "webinar", "overseas"]


def load_creds():
    raw = os.environ.get("GOOGLE_SA_JSON")
    if raw:
        return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    path = os.environ.get("GOOGLE_SA_FILE") or os.path.join(HERE, "..", "..", "hot-calendar-reader.json")
    return service_account.Credentials.from_service_account_file(path, scopes=SCOPES)


def fetch_events(creds):
    creds.refresh(Request())
    now = datetime.datetime.now(datetime.timezone.utc)
    tmin = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    tmax = (now + datetime.timedelta(days=int(MONTHS_AHEAD * 31))).strftime("%Y-%m-%dT%H:%M:%SZ")
    items, page = [], None
    while True:
        q = {"timeMin": tmin, "timeMax": tmax, "singleEvents": "true",
             "orderBy": "startTime", "maxResults": "250"}
        if page:
            q["pageToken"] = page
        url = "https://www.googleapis.com/calendar/v3/calendars/%s/events?%s" % (
            urllib.parse.quote(CAL), urllib.parse.urlencode(q))
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + creds.token})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        items += data.get("items", [])
        page = data.get("nextPageToken")
        if not page:
            break
    return items


def blocks_venue(ev):
    summary = (ev.get("summary") or "").lower()
    location = (ev.get("location") or "").lower()
    online = bool(ev.get("hangoutLink")) or "meet.google.com" in location or "zoom" in location
    if "house of transformation" in location:
        return True, "location=HoT"
    if "rental" in summary or "pencil" in summary:
        return True, "rental/pencil"
    if online or any(c in summary for c in OFFSITE):
        return False, "off-site/online"
    if any(p in summary for p in CORE_PROGRAMS):
        return True, "core-program"
    return False, "no-venue-marker"


def event_dates(ev):
    s, e = ev.get("start", {}), ev.get("end", {})
    if "date" in s:  # all-day event — Google's end date is EXCLUSIVE
        a = datetime.date.fromisoformat(s["date"])
        b = datetime.date.fromisoformat(e.get("date", s["date"]))
        if b <= a:
            b = a + datetime.timedelta(days=1)
    else:  # timed event — use the PH-local date part; block start..end inclusive
        a = datetime.date.fromisoformat((s.get("dateTime") or "")[:10])
        b = datetime.date.fromisoformat((e.get("dateTime") or s.get("dateTime") or "")[:10]) + datetime.timedelta(days=1)
        if b <= a:
            b = a + datetime.timedelta(days=1)
    out, d = [], a
    while d < b:
        out.append(d.isoformat())
        d += datetime.timedelta(days=1)
    return out


def main():
    creds = load_creds()
    events = fetch_events(creds)
    booked = set()
    for ev in events:
        if ev.get("status") == "cancelled":
            continue
        block, reason = blocks_venue(ev)
        summ = (ev.get("summary") or "(no title)")[:44]
        if block:
            ds = event_dates(ev)
            booked.update(ds)
            print("  BLOCK  %-44s [%-14s] %s..%s" % (summ, reason, ds[0], ds[-1]))
        else:
            print("  skip   %-44s [%s]" % (summ, reason))
    booked = sorted(booked)
    print("\n%d venue-blocked dates" % len(booked))

    current = None
    try:
        with open(OUT) as f:
            current = json.load(f).get("booked")
    except Exception:
        pass

    if current == booked:
        print("NO_CHANGE — booked set matches current file; leaving it untouched.")
        return

    out = {"generated": datetime.date.today().isoformat(), "source": SOURCE, "booked": booked}
    with open(OUT, "w") as f:
        json.dump(out, f, indent=0, separators=(",", ":"))
    print("CHANGED — wrote %s" % OUT)


if __name__ == "__main__":
    main()
