"""
CAT Parts Lookup — Backend module to retrieve product details from parts.cat.com.

Given a part name, fetches product link, product name, product number, and price
from https://parts.cat.com/en/catcorp (search and category pages). Uses
Playwright to load JavaScript-rendered search results so all products that
appear on the page are parsed, including partial matches.

Usage:
    from cat_parts_lookup import get_part_details, get_part_search_url

    results = get_part_details("hydraulic filter")
    for r in results:
        print(r["product_url"], r["product_number"], r["price"])

    # If you have HTML from another source (e.g. proxy):
    results = get_part_details("fuel tank", html=my_html_string)

    # Fallback link when no results:
    url = get_part_search_url("fuel tank")
"""

import re
import urllib.parse
from dataclasses import dataclass
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://parts.cat.com"
CATCORP_BASE = "https://parts.cat.com/en/catcorp"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 20
PLAYWRIGHT_WAIT_MS = 8000  # wait for JS to render search results


@dataclass
class PartDetail:
    """Single product/part result from CAT parts site."""

    product_url: str
    product_name: str
    product_number: str
    price: str | None


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
    return s


def _make_absolute(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return BASE_URL + url
    return CATCORP_BASE.rstrip("/") + "/" + url.lstrip("/")


def _extract_price(text: str) -> str | None:
    """Extract a price string like $12.34 from text."""
    if not text:
        return None
    m = re.search(r"\$\s*([\d,]+(?:\.\d{2})?)", text)
    if m:
        return "$" + m.group(1).replace(",", "")
    m = re.search(r"([\d,]+\.\d{2})\s*(?:USD|usd)?", text)
    if m:
        return "$" + m.group(1).replace(",", "")
    return None


def _is_access_denied(html: str) -> bool:
    """True if the page is Access Denied or other block."""
    if not html or len(html) < 500:
        return True
    lower = html.lower()
    if "access denied" in lower or "you don't have permission" in lower:
        return True
    return False


def _parse_search_results(soup: BeautifulSoup, page_url: str) -> list[PartDetail]:
    """Parse a search or listing page for product/category links and details.
    Intentionally broad so all products that appear on the page are included,
    not only exact query matches.
    """
    results: list[PartDetail] = []
    base_domain = urllib.parse.urlparse(page_url).netloc

    skip_paths = (
        "/parts-diagram", "/contact", "/store-locator", "/cart", "/account",
        "/login", "/register", "youtube.com", "javascript:", "tel:", "mailto:",
    )

    # 1) Selectors that usually wrap product links
    link_selectors = [
        "a[href*='/p/']",
        "a[href*='product']",
        "a[href*='partNumber']",
        "a[href*='part-number']",
        "a[href*='/category/']",
        ".product-tile a",
        ".product-card a",
        ".search-result-item a",
        "[data-product-id] a",
        "[class*='product'] a",
        "[class*='tile'] a",
        "[class*='card'] a",
        "[class*='result'] a",
    ]

    # 2) Also collect any same-origin link that looks like a product/category page
    all_in_domain = soup.select(f"a[href*='parts.cat.com'], a[href^='/']")
    seen_urls: set[str] = set()

    def process_link(a: Any, container: Any = None) -> None:
        href = a.get("href")
        if not href or not href.strip():
            return
        url = _make_absolute(href.strip())
        if "parts.cat.com" not in url and base_domain not in url:
            return
        if any(skip in url for skip in skip_paths):
            return
        if url in seen_urls:
            return
        seen_urls.add(url)
        cont = container or a.find_parent(["div", "li", "article", "section"]) or a
        name = (a.get_text(strip=True) or "").strip()
        if not name and cont:
            name = cont.get_text(strip=True)[:200] or ""
        part_num = ""
        for elem in cont.select("[data-part-number], .part-number, .partNumber, .sku, [data-sku]"):
            part_num = elem.get("data-part-number") or elem.get("data-sku") or elem.get_text(strip=True)
            if part_num:
                break
        if not part_num and cont:
            num_elem = cont.find(string=re.compile(r"\d{4,}"))
            if num_elem and num_elem.parent:
                part_num = num_elem.parent.get_text(strip=True)
        price = None
        for elem in cont.select(".price, .product-price, [data-price], .amount"):
            price = elem.get("data-price") or _extract_price(elem.get_text())
            if price:
                break
        if not price and cont:
            price = _extract_price(cont.get_text())
        results.append(
            PartDetail(
                product_url=url,
                product_name=name or "—",
                product_number=part_num or "—",
                price=price,
            )
        )

    for selector in link_selectors:
        for a in soup.select(selector):
            process_link(a)

    for a in all_in_domain:
        href = a.get("href", "")
        if not href or href.startswith("#") or "parts-diagram" in href:
            continue
        if any(skip in href for skip in skip_paths):
            continue
        # Only add if it looks like a content page (category, product, part)
        if "/category/" in href or "/p/" in href or "product" in href.lower() or "part" in href.lower():
            if _make_absolute(href) not in seen_urls:
                process_link(a)

    return results


def _fetch_with_playwright(
    part_name: str,
    proxy: str | None = None,
    headless: bool = True,
) -> tuple[str | None, str]:
    """Fetch the search page using Playwright (JS-rendered). Tries Firefox then Chromium."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, ""
    encoded = urllib.parse.quote_plus(part_name.strip())
    search_url = f"{CATCORP_BASE}/search?q={encoded}"
    timeout_ms = REQUEST_TIMEOUT * 1000

    context_options: dict[str, Any] = {
        "viewport": {"width": 1280, "height": 720},
        "user_agent": USER_AGENT,
        "ignore_https_errors": True,
    }
    if proxy:
        context_options["proxy"] = {"server": proxy}

    with sync_playwright() as p:
        # Try Firefox first (often avoids HTTP/2 issues)
        for browser_type in ("firefox", "chromium"):
            try:
                if browser_type == "firefox":
                    browser = p.firefox.launch(headless=headless)
                else:
                    browser = p.chromium.launch(
                        headless=headless,
                        args=["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
                    )
                context = browser.new_context(**context_options)
                page = context.new_page()
                page.goto(search_url, wait_until="load", timeout=timeout_ms)
                # Wait for client-side search results to render
                page.wait_for_timeout(PLAYWRIGHT_WAIT_MS)
                # Optionally wait for any product-like content
                try:
                    page.wait_for_selector(
                        "a[href*='/category/'], a[href*='/p/'], [class*='product'], [class*='result']",
                        timeout=5000,
                    )
                except Exception:
                    pass
                html = page.content()
                context.close()
                browser.close()
                if not _is_access_denied(html):
                    return html, page.url
            except Exception:
                try:
                    browser.close()
                except Exception:
                    pass
                continue
    return None, ""


def _fetch_with_requests(part_name: str) -> tuple[str | None, str]:
    """Fetch search page with requests (static HTML only)."""
    encoded = urllib.parse.quote_plus(part_name.strip())
    urls_to_try = [
        f"{CATCORP_BASE}/search?q={encoded}",
        f"{CATCORP_BASE}/search?searchTerm={encoded}",
        f"{CATCORP_BASE}/shop-all-categories",
    ]
    session = _session()
    for url in urls_to_try:
        try:
            r = session.get(url, timeout=REQUEST_TIMEOUT)
            if r.ok and not _is_access_denied(r.text):
                return r.text, r.url
        except requests.RequestException:
            continue
    return None, ""


def get_part_search_url(part_name: str) -> str:
    """Return the CAT parts search URL for the given part name (for fallback link)."""
    if not (part_name and part_name.strip()):
        return CATCORP_BASE + "/shop-all-categories"
    encoded = urllib.parse.quote_plus(part_name.strip())
    return f"{CATCORP_BASE}/search?q={encoded}"


def get_part_details(
    part_name: str,
    *,
    html: str | None = None,
    use_playwright: bool = True,
    use_requests: bool = True,
    proxy: str | None = None,
    include_search_url_fallback: bool = True,
) -> list[dict[str, Any]]:
    """
    Retrieve product details from parts.cat.com for the given part name.
    Uses Playwright first to load JavaScript-rendered search results so all
    products that appear on the page (including partial matches) are returned.

    Args:
        part_name: The name or description of the part (e.g. "fuel tank", "filter").
        html: Optional. If provided, this HTML is parsed instead of fetching.
              Use when you have page HTML from a proxy or other source.
        use_playwright: If True (default), fetch the search page with Playwright.
        use_requests: If True (default), try requests if Playwright fails or returns nothing.
        proxy: Optional proxy URL for Playwright (e.g. "http://proxy:8080").
        include_search_url_fallback: If True (default), when no products are found,
              append one result with the CAT search URL so the app can still link somewhere.

    Returns:
        List of dicts with keys: product_url, product_name, product_number, price.
    """
    if not (part_name and part_name.strip()) and not html:
        return []

    page_url = CATCORP_BASE + "/search"
    if html:
        soup = BeautifulSoup(html, "html.parser")
        details = _parse_search_results(soup, page_url)
        out = [
            {"product_url": d.product_url, "product_name": d.product_name, "product_number": d.product_number, "price": d.price}
            for d in details
        ]
        if not out and include_search_url_fallback and part_name and part_name.strip():
            out.append({
                "product_url": get_part_search_url(part_name),
                "product_name": f"Search for “{part_name.strip()}” on CAT Parts",
                "product_number": "—",
                "price": None,
            })
        return out

    details: list[PartDetail] = []
    fetched_html: str | None = None
    fetched_url = ""

    # 1) Prefer Playwright so we get JS-rendered products
    if use_playwright:
        fetched_html, fetched_url = _fetch_with_playwright(part_name, proxy=proxy)
        if fetched_html:
            soup = BeautifulSoup(fetched_html, "html.parser")
            details = _parse_search_results(soup, fetched_url)

    # 2) If no products yet, try requests
    if not details and use_requests:
        fetched_html, fetched_url = _fetch_with_requests(part_name)
        if fetched_html:
            soup = BeautifulSoup(fetched_html, "html.parser")
            details = _parse_search_results(soup, fetched_url)

    out = [
        {"product_url": d.product_url, "product_name": d.product_name, "product_number": d.product_number, "price": d.price}
        for d in details
    ]
    if not out and include_search_url_fallback and part_name and part_name.strip():
        out.append({
            "product_url": get_part_search_url(part_name),
            "product_name": f"Search for “{part_name.strip()}” on CAT Parts",
            "product_number": "—",
            "price": None,
        })
    return out


if __name__ == "__main__":
    import sys
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "fuel tank"
    print("Query:", repr(query))
    results = get_part_details(query)
    if not results:
        print("No products parsed. Search URL:", get_part_search_url(query))
        print("Tip: If the site blocks automation, pass HTML from a browser or use a proxy.")
    for item in results:
        print(item)
