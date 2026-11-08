#!/usr/bin/env python3
"""Turn the "Put Your Farm on the Map" .docx into the web version's data.

The Word file in public/downloads/ is the single source of truth for the guide.
This reads it and writes:

  src/data/put-your-farm-guide.json  every web page's blocks (text and inline
                                     bold/italic/links, kept word for word)
  src/data/put-your-farm-toc.json    slugs, titles and descriptions only, for
                                     the landing page's table of contents

After editing the .docx, regenerate the PDF from it with LibreOffice and run
this again, so the Word file, the PDF and the web pages say the same thing:

  soffice --headless --convert-to pdf --outdir public/downloads public/downloads/put-your-farm-on-the-map.docx
  python3 scripts/put-your-farm-guide.py

Needs python-docx (pip install python-docx). Not part of `npm run build`: the
JSON it writes is committed.
"""
import json
import re
import sys
from pathlib import Path

import docx
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "public" / "downloads" / "put-your-farm-on-the-map.docx"
OUT = ROOT / "src" / "data" / "put-your-farm-guide.json"
TOC_OUT = ROOT / "src" / "data" / "put-your-farm-toc.json"

# Web-only page metadata: <title>/<meta description> text and short TOC labels.
# The page bodies all come from the .docx.
META = {
    "start": {
        "title": "Start here",
        "description": "Why this guide exists, how the one-job-a-day idea works, and the easiest jobs to do first if you only have an hour.",
    },
    "day-1": {"description": "Write down your farm's basics once, make a free farm email, and set up safe passwords with two-step sign-in."},
    "day-2": {"description": "Take ten good photos with your phone and make a free Facebook Page for your farm, step by step."},
    "day-3": {"description": "Write your first Facebook post, plan a simple weekly posting habit, and add a helper to your Page safely."},
    "day-4": {"description": "Take payments without cash: Venmo, Cash App, PayPal, Zelle and Square fees as of October 11, 2026, plus a QR payment sign."},
    "day-5": {"description": "Find or make your farm's free Google Business Profile so you show up on Google Maps."},
    "day-6": {"description": "Verify your Google Business Profile by postcard, phone, email or video, and keep the code safe."},
    "day-7": {"description": "Fix your map pin, set your hours and special hours, and write your Google category and description."},
    "day-8": {"description": "Add photos and a post to your Google listing, and add a helper as a Manager so you stay the owner."},
    "day-9": {"description": "Ask for honest Google reviews, answer every review, and learn the scams that target small businesses."},
    "day-10": {"description": "Ten minutes a month to keep your hours, posts, reviews and map pin right, and what to do if something goes wrong."},
    "day-11": {"description": "Who to call in New York about the rules for selling from home, and exactly what to ask each office."},
    "day-12": {"description": "Take orders and sign-ups with a free Google Form, plus a short checklist for running a CSA or farm share."},
    "day-13": {"description": "Get found in local Facebook groups, Marketplace, free farm directories such as Hudson Valley Bounty, and the Almanacs."},
    "day-14": {"description": "Set fair prices, keep them the same everywhere, and keep a simple daily sales log."},
    "day-15": {"description": "Stay in touch with your regulars through Facebook, a sign-up notebook and a group email sent with Bcc."},
    "day-16": {"description": "A sign people can read from the road, posted prices, a locked cash box and other simple things for your stand."},
    "day-17": {"description": "Offline ways to be found: tell-a-friend cards, bulletin boards, markets, a chalkboard and local papers."},
    "free-tools": {
        "title": "Free tools",
        "description": "Three free website builders, what to know about AI website ads, and the free Google and other programs worth knowing.",
    },
    "ai-helpers": {
        "title": "A short introduction to AI helpers",
        "description": "What AI assistants can do for a small seller, how to write a prompt, and ready-made prompts to copy.",
    },
    "where-to-get-help": {
        "title": "Where to get help in New York",
        "description": "Free help for New York farms and home sellers, in one list: Cooperative Extension, SBDC, SCORE, NY FarmNet, state offices and directories.",
    },
    "word-list": {
        "title": "Plain-English word list",
        "description": "Plain-English meanings for the words in this guide, from account and Business Profile to QR code, verify and prompt.",
    },
    "what-to-do-next": {
        "title": "You did it. What to do next",
        "description": "A checklist of what you should have by now, a simple plan for the next 30 days, and a few practical notes.",
    },
}

SPECIAL_PAGES = {
    "Where to get help in New York": "where-to-get-help",
    "Plain-English word list": "word-list",
    "You did it. What to do next": "what-to-do-next",
}


def is_on(el):
    return el is not None and el.get(qn("w:val")) not in ("0", "false")


def run_fmt(r):
    rpr = r.find(qn("w:rPr"))
    if rpr is None:
        return False, False
    return is_on(rpr.find(qn("w:b"))), is_on(rpr.find(qn("w:i")))


def runs_of(p, rels):
    """Inline runs as [{t, b?, i?, href?}], adjacent same-format runs merged."""
    out = []

    def add(text, b, i, href=None):
        if not text:
            return
        last = out[-1] if out else None
        if last and last.get("b", False) == b and last.get("i", False) == i and last.get("href") == href:
            last["t"] += text
            return
        item = {"t": text}
        if b:
            item["b"] = True
        if i:
            item["i"] = True
        if href:
            item["href"] = href
        out.append(item)

    def text_of(r):
        parts = []
        for c in r:
            if c.tag == qn("w:t"):
                parts.append(c.text or "")
            elif c.tag == qn("w:br"):
                parts.append("\n")
            elif c.tag == qn("w:tab"):
                parts.append(" ")
        return "".join(parts)

    for child in p:
        if child.tag == qn("w:r"):
            b, i = run_fmt(child)
            add(text_of(child), b, i)
        elif child.tag == qn("w:hyperlink"):
            href = rels[child.get(qn("r:id"))].target_ref
            for r in child.iter(qn("w:r")):
                b, i = run_fmt(r)
                add(text_of(r), b, i, href)
    return out


def strip_lead(runs, pattern):
    """Drop a leading marker such as '☐   ' or '•  ' from the runs."""
    while runs:
        m = re.match(pattern, runs[0]["t"])
        if not m:
            break
        runs[0]["t"] = runs[0]["t"][m.end():]
        if runs[0]["t"]:
            break
        runs.pop(0)
        pattern = r"\s+"  # marker and its spacing can sit in separate runs
    return runs


def trim(runs):
    if runs:
        runs[0]["t"] = runs[0]["t"].lstrip()
        runs[-1]["t"] = runs[-1]["t"].rstrip()
    return [r for r in runs if r["t"]]


def para_info(p):
    ppr = p.find(qn("w:pPr"))
    shd = None
    if ppr is not None and ppr.find(qn("w:shd")) is not None:
        shd = ppr.find(qn("w:shd")).get(qn("w:fill"))
    first = p.find(qn("w:r"))
    font = size = color = None
    if first is not None and first.find(qn("w:rPr")) is not None:
        rpr = first.find(qn("w:rPr"))
        f = rpr.find(qn("w:rFonts"))
        font = f.get(qn("w:ascii")) if f is not None else None
        s = rpr.find(qn("w:sz"))
        size = s.get(qn("w:val")) if s is not None else None
        c = rpr.find(qn("w:color"))
        color = c.get(qn("w:val")) if c is not None else None
    return shd, font, size, color


def plain(runs):
    return "".join(r["t"] for r in runs)


def main():
    doc = docx.Document(str(DOCX))
    rels = doc.part.rels
    paras = [p for p in doc.element.body.iterchildren(qn("w:p"))]

    pages = []
    page = None
    pending_part = None  # {"label", "intro"} for the next page
    expect_part_intro = False

    def new_page(slug, title, part=None):
        nonlocal page
        page = {"slug": slug, "title": title, "blocks": []}
        if part:
            page["part"] = part
        pages.append(page)

    def push(block):
        blocks = page["blocks"]
        kind = block["type"]
        # Group consecutive list items.
        if kind in ("check", "bullet", "number"):
            list_type = {"check": "checklist", "bullet": "list", "number": "numbered"}[kind]
            if blocks and blocks[-1]["type"] == list_type and not blocks[-1].get("closed"):
                blocks[-1]["items"].append(block["runs"])
            else:
                blocks.append({"type": list_type, "items": [block["runs"]]})
                if "start" in block:
                    blocks[-1]["start"] = block["start"]
            return
        if blocks and blocks[-1]["type"] in ("checklist", "list", "numbered"):
            blocks[-1]["closed"] = True
        blocks.append(block)

    started = False
    for p in paras:
        runs = runs_of(p, rels)
        text = plain(runs).strip()
        if not text:
            continue
        shd, font, size, color = para_info(p)

        if not started:
            if text.startswith("I wrote this because"):
                started = True
                new_page("start", META["start"]["title"])
            else:
                continue  # cover page; the landing page has its own masthead

        # Part labels: "PART 1: YOUR FIRST WEEKEND" (+ intro) or "PART 4" (+ h1 + intro).
        if color == "5D6D50" and size == "19" and text.startswith("PART "):
            pending_part = {"label": text}
            expect_part_intro = True
            continue

        if font == "Verdana" and size == "44":
            m = re.match(r"DAY (\d+) — (.+)", text)
            if m:
                slug, title = f"day-{m.group(1)}", text
            elif text in SPECIAL_PAGES:
                slug, title = SPECIAL_PAGES[text], text
            elif text == "Free tools":
                slug, title = "free-tools", text
            elif text == "A short introduction to AI helpers":
                slug, title = "ai-helpers", text
            else:
                raise SystemExit(f"unknown page heading: {text!r}")
            new_page(slug, title, pending_part)
            # "PART 4" then "Free tools" then the part intro paragraph.
            if pending_part and pending_part.get("intro"):
                expect_part_intro = False
            pending_part = None
            continue

        if expect_part_intro:
            target = pending_part if pending_part else page.get("part")
            if target is not None and "intro" not in target:
                target["intro"] = trim(runs)
                expect_part_intro = False
                continue

        if font == "Verdana" and size == "28":
            push({"type": "h2", "text": text})
            continue
        if font == "Verdana" and size == "22" and shd is None:
            push({"type": "checklist-heading", "text": text})
            continue

        if shd == "EEF3EC":
            label = runs[0]["t"].strip() if runs else ""
            if label.endswith(":"):
                push({"type": "callout", "label": label.rstrip(":"), "runs": trim(runs[1:])})
            elif text.startswith("•"):
                page["blocks"][-1]["items"].append(trim(strip_lead(runs, r"•\s*")))
            else:
                push({"type": "sidebar", "title": text, "items": []})
            continue

        if shd == "F6F1E6":
            if "\n" in text and runs and runs[0].get("b"):
                label, _, rest = plain(runs).partition("\n")
                push({"type": "prompt", "label": label.strip(), "text": rest.strip()})
            else:
                push({"type": "prompt", "text": text})
            continue

        if text.startswith("☐"):
            push({"type": "check", "runs": trim(strip_lead(runs, r"☐\s*"))})
            continue
        if text.startswith("•"):
            push({"type": "bullet", "runs": trim(strip_lead(runs, r"•\s*"))})
            continue
        m = re.match(r"(\d+)\.\s", text)
        if m and runs[0].get("b"):
            push({"type": "number", "start": int(m.group(1)), "runs": trim(strip_lead(runs, r"\d+\.\s*"))})
            continue

        if color == "5D6D50" and re.match(r"(Tomorrow|Next):", text):
            push({"type": "next", "text": text})
            continue
        if color == "5D6D50":
            push({"type": "note", "runs": trim(runs)})
            continue

        if text.startswith("Did it work?"):
            push({"type": "did-it-work", "runs": trim(runs)})
            continue

        block = {"type": "p", "runs": trim(runs)}
        # The first paragraph under a day's title says how long it takes.
        if page["slug"].startswith("day-") and not page["blocks"]:
            block["lede"] = True
        push(block)

    for pg in pages:
        for b in pg["blocks"]:
            b.pop("closed", None)
        meta = META.get(pg["slug"], {})
        if "title" in meta:
            pg["title"] = meta["title"]
        pg["description"] = meta.get("description", "")
        m = re.match(r"DAY (\d+) — (.+)", pg["title"])
        if m:
            pg["day"] = int(m.group(1))
            pg["short"] = m.group(2)
        else:
            pg["short"] = pg["title"]

    order = ["start"] + [f"day-{n}" for n in range(1, 18)] + [
        "free-tools", "ai-helpers", "where-to-get-help", "word-list", "what-to-do-next"]
    got = [pg["slug"] for pg in pages]
    if got != order:
        raise SystemExit(f"unexpected page order: {got}")
    missing = [s for s in order if not META.get(s, {}).get("description")]
    if missing:
        raise SystemExit(f"no description for: {missing}")

    OUT.write_text(json.dumps({"source": DOCX.name, "pages": pages}, ensure_ascii=False, indent=1) + "\n")
    toc = [{k: pg[k] for k in ("slug", "title", "short", "description", "day", "part") if k in pg} for pg in pages]
    for t in toc:
        if "part" in t:
            t["part"] = {"label": t["part"]["label"]}
    TOC_OUT.write_text(json.dumps(toc, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(pages)} pages) and {TOC_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
