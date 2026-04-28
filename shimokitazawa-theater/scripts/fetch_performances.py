#!/usr/bin/env python3
"""
下北沢演劇ガイド — 公演情報スクレイパー
チケットぴあ・イープラスから下北沢会場の公演情報を取得し
data/performances.json に出力する。

使用方法:
    pip install -r requirements.txt
    playwright install chromium
    python scripts/fetch_performances.py [--output data/performances.json]
"""

import asyncio
import json
import re
import sys
import time
import argparse
from datetime import datetime, date
from pathlib import Path

# Playwright は JS レンダリングが必要なページ用
try:
    from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

import requests
from bs4 import BeautifulSoup

# ────────────────────────────────────────────
# 設定
# ────────────────────────────────────────────
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_DELAY = 1.5   # サーバー負荷軽減のためリクエスト間隔(秒)
REQUEST_TIMEOUT = 15  # タイムアウト(秒)

# 下北沢の主要劇場名キーワード（検索絞り込み用）
SHIMOKITAZAWA_VENUES = [
    "本多劇場",
    "ザ・スズナリ",
    "スズナリ",
    "小劇場B1",
    "シアター711",
    "OFF OFFシアター",
    "小劇場楽園",
    "劇場MOMO",
    "駅前劇場",
    "下北沢",
]

# venues.json の id マッピング
VENUE_ID_MAP = {
    "本多劇場": "honda",
    "ザ・スズナリ": "suzunari",
    "スズナリ": "suzunari",
    "小劇場B1": "b1",
    "シアター711": "711",
    "OFF OFFシアター": "offoff",
    "小劇場楽園": "rakuen",
    "劇場MOMO": "momo",
    "駅前劇場": "ekimae",
}

# ────────────────────────────────────────────
# チケットぴあ スクレイパー
# ────────────────────────────────────────────
class PiaScraper:
    BASE_URL = "https://t.pia.jp"
    SEARCH_URL = "https://t.pia.jp/pia/search.do"

    def search(self, keyword: str, genre_cd: str = "001") -> list[dict]:
        """
        チケットぴあのキーワード検索。
        genre_cd: 001=演劇・ダンス
        """
        params = {
            "kw": keyword,
            "genreCd": genre_cd,
            "sort": "1",  # 公演日順
        }
        performances = []
        page = 1
        while True:
            params["page"] = page
            try:
                resp = requests.get(
                    self.SEARCH_URL,
                    params=params,
                    headers=HEADERS,
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                resp.encoding = "UTF-8"
            except requests.RequestException as e:
                print(f"[PIA] 検索失敗: {e}", file=sys.stderr)
                break

            soup = BeautifulSoup(resp.text, "lxml")
            items = soup.select(".eventlist-item, .evt-list-item, li.event-item")
            if not items:
                # セレクタが変わっている場合のフォールバック
                items = soup.select("article, .performance-item, .search-result-item")

            if not items:
                break

            for item in items:
                perf = self._parse_item(item)
                if perf and self._is_shimokitazawa(perf):
                    performances.append(perf)

            # 次ページがなければ終了
            next_btn = soup.select_one("a.next, .pager-next a, [aria-label='次のページ']")
            if not next_btn:
                break
            page += 1
            time.sleep(REQUEST_DELAY)

        return performances

    def _parse_item(self, item) -> dict | None:
        try:
            title_el = item.select_one(
                ".event-name, .evt-name, h3, h2, .title, [class*='title']"
            )
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                return None

            venue_el = item.select_one(
                ".venue, .kaijo, [class*='venue'], [class*='place']"
            )
            venue_raw = venue_el.get_text(strip=True) if venue_el else ""

            date_el = item.select_one(
                ".date, .period, [class*='date'], time"
            )
            date_raw = date_el.get_text(strip=True) if date_el else ""

            price_el = item.select_one(
                ".price, [class*='price'], [class*='charge']"
            )
            price_raw = price_el.get_text(strip=True) if price_el else ""

            link_el = item.select_one("a[href]")
            detail_url = ""
            if link_el:
                href = link_el.get("href", "")
                detail_url = href if href.startswith("http") else self.BASE_URL + href

            return {
                "source": "pia",
                "title": title,
                "venue_raw": venue_raw,
                "date_raw": date_raw,
                "price_raw": price_raw,
                "ticket_url": detail_url,
            }
        except Exception:
            return None

    def get_detail(self, url: str) -> dict:
        """公演詳細ページから追加情報を取得"""
        try:
            time.sleep(REQUEST_DELAY)
            resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = "UTF-8"
            soup = BeautifulSoup(resp.text, "lxml")

            synopsis = ""
            for sel in [".story, .synopsis, .description, #story, #synopsis, [class*='story']"]:
                el = soup.select_one(sel)
                if el:
                    synopsis = el.get_text(separator="\n", strip=True)
                    break

            cast = []
            for sel in [".cast, #cast, [class*='cast']"]:
                el = soup.select_one(sel)
                if el:
                    cast_text = el.get_text(strip=True)
                    cast = [c.strip() for c in re.split(r"[、,・\n/／]", cast_text) if c.strip()]
                    break

            company = ""
            for sel in [".produce, .company, [class*='produce'], [class*='company']"]:
                el = soup.select_one(sel)
                if el:
                    company = el.get_text(strip=True)
                    break

            return {"synopsis": synopsis, "cast": cast, "company": company}
        except Exception:
            return {}

    def _is_shimokitazawa(self, perf: dict) -> bool:
        venue = perf.get("venue_raw", "")
        return any(kw in venue for kw in SHIMOKITAZAWA_VENUES)


# ────────────────────────────────────────────
# イープラス スクレイパー (Playwright使用)
# ────────────────────────────────────────────
class EplusScraper:
    SEARCH_URL = "https://eplus.jp/sf/search"
    BASE_URL = "https://eplus.jp"

    async def search(self, keyword: str) -> list[dict]:
        """イープラスのキーワード検索（JS レンダリング必要）"""
        if not PLAYWRIGHT_AVAILABLE:
            print("[EPLUS] Playwright 未インストール。スキップします。", file=sys.stderr)
            print("        pip install playwright && playwright install chromium", file=sys.stderr)
            return []

        performances = []
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                locale="ja-JP",
            )
            page = await context.new_page()

            try:
                url = f"{self.SEARCH_URL}?keyword={requests.utils.quote(keyword)}&genre=001"
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(2000)

                items = await page.query_selector_all(
                    ".event-list-item, .search-result-item, article.item, li.event"
                )

                for item in items:
                    perf = await self._parse_item(item, page)
                    if perf and self._is_shimokitazawa(perf):
                        performances.append(perf)

                # 次ページ処理
                while True:
                    next_btn = await page.query_selector(
                        "a[aria-label='次へ'], .pager-next a, button.next-page"
                    )
                    if not next_btn:
                        break
                    await next_btn.click()
                    await page.wait_for_timeout(2000)
                    items = await page.query_selector_all(
                        ".event-list-item, .search-result-item, article.item, li.event"
                    )
                    for item in items:
                        perf = await self._parse_item(item, page)
                        if perf and self._is_shimokitazawa(perf):
                            performances.append(perf)

            except PWTimeout:
                print("[EPLUS] タイムアウト", file=sys.stderr)
            finally:
                await browser.close()

        return performances

    async def _parse_item(self, item, page) -> dict | None:
        try:
            title = await item.eval_on_selector(
                ".event-name, .title, h2, h3",
                "el => el.textContent.trim()",
            ) or ""
            venue_raw = await item.eval_on_selector(
                ".venue, .place, [class*='venue']",
                "el => el.textContent.trim()",
            ) or ""
            date_raw = await item.eval_on_selector(
                ".date, time, [class*='date']",
                "el => el.textContent.trim()",
            ) or ""
            link_el = await item.query_selector("a[href]")
            href = await link_el.get_attribute("href") if link_el else ""
            ticket_url = href if href.startswith("http") else self.BASE_URL + href

            return {
                "source": "eplus",
                "title": title,
                "venue_raw": venue_raw,
                "date_raw": date_raw,
                "ticket_url": ticket_url,
            }
        except Exception:
            return None

    def _is_shimokitazawa(self, perf: dict) -> bool:
        venue = perf.get("venue_raw", "")
        return any(kw in venue for kw in SHIMOKITAZAWA_VENUES)


# ────────────────────────────────────────────
# データ正規化
# ────────────────────────────────────────────
def normalize_performance(raw: dict, detail: dict = None) -> dict:
    """スクレイプ生データを performances.json スキーマに変換"""
    detail = detail or {}

    title = raw.get("title", "").strip()
    venue_raw = raw.get("venue_raw", "")
    venue_id = _map_venue_id(venue_raw)
    dates = _parse_dates(raw.get("date_raw", ""))
    price = _parse_price(raw.get("price_raw", ""))
    synopsis = detail.get("synopsis", "").strip()
    cast = detail.get("cast", [])
    company = detail.get("company", raw.get("company", "")).strip()

    perf_id = "p_" + re.sub(r"\W+", "_", title)[:20] + "_" + (dates[0] if dates else "nodate")

    return {
        "id": perf_id,
        "venueId": venue_id,
        "title": title,
        "company": company,
        "organizer": detail.get("organizer", ""),
        "genre": _infer_genre(title, company),
        "dates": dates,
        "openingTime": "",
        "startTime": "",
        "matineeDates": [],
        "matineeOpeningTime": "",
        "matineeStartTime": "",
        "price": price,
        "ticketUrl": raw.get("ticket_url", ""),
        "synopsis": synopsis,
        "cast": cast,
        "imageColor": _pick_color(venue_id),
        "tags": [],
        "_source": raw.get("source", ""),
        "_scraped_at": datetime.now().isoformat(),
    }


def _map_venue_id(venue_raw: str) -> str:
    for keyword, vid in VENUE_ID_MAP.items():
        if keyword in venue_raw:
            return vid
    return "unknown"


def _parse_dates(date_raw: str) -> list[str]:
    """日付文字列から YYYY-MM-DD リストを生成"""
    dates = []
    patterns = [
        r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
        r"(\d{1,2})[月/](\d{1,2})",
    ]
    year = datetime.now().year
    found = []
    for pat in patterns:
        for m in re.finditer(pat, date_raw):
            groups = m.groups()
            if len(groups) == 3:
                y, mo, d = int(groups[0]), int(groups[1]), int(groups[2])
            else:
                y, mo, d = year, int(groups[0]), int(groups[1])
            try:
                found.append(date(y, mo, d).isoformat())
            except ValueError:
                pass
    return sorted(set(found))


def _parse_price(price_raw: str) -> dict:
    nums = re.findall(r"[\d,]+", price_raw.replace("円", ""))
    values = [int(n.replace(",", "")) for n in nums if int(n.replace(",", "")) > 500]
    if not values:
        return {}
    if len(values) == 1:
        return {"general": values[0]}
    return {"general": max(values), "student": min(values)}


def _infer_genre(title: str, company: str) -> str:
    text = title + company
    if any(kw in text for kw in ["ミュージカル", "musical", "Musical"]):
        return "ミュージカル"
    if any(kw in text for kw in ["ダンス", "dance", "Dance", "バレエ"]):
        return "ダンス"
    if any(kw in text for kw in ["コメディ", "喜劇", "笑"]):
        return "コメディ"
    if any(kw in text for kw in ["歌舞伎", "落語", "狂言", "能"]):
        return "伝統芸能"
    return "現代演劇"


def _pick_color(venue_id: str) -> str:
    colors = {
        "honda": "#2d4a6b", "suzunari": "#4a2d6b", "b1": "#1a4a2d",
        "711": "#5a2d1a", "offoff": "#1a4a4a", "rakuen": "#4a4a1a",
        "momo": "#2d5a2d", "ekimae": "#1a2d5a",
    }
    return colors.get(venue_id, "#2d2d2d")


# ────────────────────────────────────────────
# 重複排除
# ────────────────────────────────────────────
def deduplicate(performances: list[dict]) -> list[dict]:
    """タイトル＋会場で重複を排除し、情報が多い方を残す"""
    seen = {}
    for p in performances:
        key = (p["title"].lower(), p["venueId"])
        if key not in seen:
            seen[key] = p
        else:
            # より詳細な情報を持つ方を残す
            existing = seen[key]
            if len(p.get("synopsis", "")) > len(existing.get("synopsis", "")):
                seen[key] = p
    return list(seen.values())


# ────────────────────────────────────────────
# メイン処理
# ────────────────────────────────────────────
async def run(output_path: str, fetch_details: bool = False) -> None:
    all_raw: list[dict] = []

    # ─── チケットぴあ ───────────────────────
    print("=== チケットぴあ 検索開始 ===")
    pia = PiaScraper()
    keywords = ["本多劇場", "ザ・スズナリ", "下北沢 演劇"]
    for kw in keywords:
        print(f"  キーワード: {kw}")
        results = pia.search(kw)
        print(f"  → {len(results)} 件取得")
        all_raw.extend(results)
        time.sleep(REQUEST_DELAY)

    # ─── イープラス ─────────────────────────
    print("=== イープラス 検索開始 ===")
    eplus = EplusScraper()
    for kw in ["下北沢", "本多劇場", "ザ・スズナリ"]:
        print(f"  キーワード: {kw}")
        results = await eplus.search(kw)
        print(f"  → {len(results)} 件取得")
        all_raw.extend(results)

    print(f"\n合計 {len(all_raw)} 件（重複含む）")

    # ─── 詳細取得（オプション）───────────────
    normalized = []
    for raw in all_raw:
        detail = {}
        if fetch_details and raw.get("ticket_url"):
            print(f"  詳細取得: {raw['title'][:30]}...")
            if raw["source"] == "pia":
                detail = pia.get_detail(raw["ticket_url"])
            time.sleep(REQUEST_DELAY)
        normalized.append(normalize_performance(raw, detail))

    performances = deduplicate(normalized)
    # 日付でソート
    performances.sort(key=lambda p: p["dates"][0] if p["dates"] else "9999")

    print(f"重複排除後: {len(performances)} 件")

    # ─── 出力 ────────────────────────────────
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as f:
        json.dump({"performances": performances}, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 保存完了: {output_path}")
    _print_summary(performances)


def _print_summary(performances: list[dict]) -> None:
    from collections import Counter
    venues = Counter(p["venueId"] for p in performances)
    sources = Counter(p.get("_source", "?") for p in performances)
    print("\n── 会場別件数 ──")
    for v, c in venues.most_common():
        print(f"  {v}: {c}")
    print("\n── ソース別 ──")
    for s, c in sources.most_common():
        print(f"  {s}: {c}")


# ────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="下北沢 公演情報スクレイパー")
    parser.add_argument(
        "--output", "-o",
        default="data/performances.json",
        help="出力先JSONパス (default: data/performances.json)",
    )
    parser.add_argument(
        "--details", "-d",
        action="store_true",
        help="詳細ページも取得する（時間がかかります）",
    )
    args = parser.parse_args()

    asyncio.run(run(args.output, fetch_details=args.details))


if __name__ == "__main__":
    main()
