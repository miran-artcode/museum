import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = resolve("pairwise-research");
const BASE_URL = pathToFileURL(resolve(ROOT, "index.html")).href;
const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function capture({ stage, filename, viewport, prepare }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}?stage=${stage}`);
  if (prepare) await prepare(page);
  await page.screenshot({ path: resolve(ROOT, filename), fullPage: true });
  await context.close();
}

try {
  await capture({ stage: "pre", filename: "prototype-desktop.png", viewport: { width: 1440, height: 1000 } });
  await capture({ stage: "pre", filename: "prototype-mobile.png", viewport: { width: 390, height: 844 } });
  await capture({ stage: "selfBefore", filename: "self-before.png", viewport: { width: 1280, height: 900 } });
  await capture({ stage: "selfAfter", filename: "self-after.png", viewport: { width: 1280, height: 900 } });
  await capture({
    stage: "selfAfter",
    filename: "self-reason.png",
    viewport: { width: 1280, height: 900 },
    prepare: async (page) => {
      for (const itemId of ["overall", "veri", "cause", "caption", "voice"]) {
        await page.locator(`[data-self-item="${itemId}"][data-value="3"]`).click();
      }
      await page.locator("#self-evidence").fill("작품의 표면 흔적과 설명이 사물의 쓰임을 구체적으로 연결한다.");
      await page.locator("#self-submit").click();
    },
  });
  await capture({
    stage: "pair",
    filename: "pair-desktop.png",
    viewport: { width: 1440, height: 1200 },
    prepare: async (page) => {
      await page.locator("[data-choose-work]").first().scrollIntoViewIfNeeded();
      await page.locator("[data-choose-work]").last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const raw = localStorage.getItem("museum.pairwiseResearch.prototype.r3");
        return raw && JSON.parse(raw).pairwise.draft?.bothSeenAt;
      });
      await page.locator("[data-choose-work]").first().click();
    },
  });
  await capture({ stage: "pair", filename: "pair-mobile.png", viewport: { width: 390, height: 844 } });
  await capture({ stage: "ai", filename: "ai-rating.png", viewport: { width: 1280, height: 900 } });
  console.log("prototype screenshots updated");
} finally {
  await browser.close();
}
