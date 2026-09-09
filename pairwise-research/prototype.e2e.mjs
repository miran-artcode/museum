import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  AI_RATING_ITEMS,
  PRE_SURVEY_ITEMS,
  SELF_ASSESSMENT_ITEMS,
  SELF_ASSESSMENT_VERSION,
} from "./research-spec.mjs";

const STORAGE_KEY = "museum.pairwiseResearch.prototype.r3";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = pathToFileURL(resolve("pairwise-research/index.html")).href;
const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function chooseAll(page, attribute, ids, value) {
  for (const id of ids) {
    await page.locator(`[${attribute}="${id}"][data-value="${value}"]`).click();
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  await page.goto(BASE_URL + "?stage=pre");

  await chooseAll(page, "data-pre-item", PRE_SURVEY_ITEMS.map((item) => item.id), 1);
  await page.locator("#pre-form button[type=submit]").click();
  await page.waitForSelector('[data-self-phase="before"]');

  await chooseAll(page, "data-self-item", SELF_ASSESSMENT_ITEMS.map((item) => item.id), 3);
  await page.locator("#self-evidence").fill("표면의 마모와 작품 캡션이 사물의 쓰임을 구체적으로 연결한다.");
  await page.locator("#self-submit").click();
  await page.locator("#start-pairs").click();

  for (let index = 0; index < 12; index += 1) {
    await page.waitForSelector("[data-choose-work]");
    await page.locator("[data-choose-work]").first().scrollIntoViewIfNeeded();
    await page.locator("[data-choose-work]").last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("museum.pairwiseResearch.prototype.r3");
      return raw && JSON.parse(raw).pairwise.draft?.bothSeenAt;
    });
    await page.locator("[data-choose-work]").first().click();
    await page.locator('[data-confidence="3"]').click();
    if (await page.locator("#reason").count()) {
      await page.locator("#reason").fill("형태와 표면의 흔적이 제시된 설명과 구체적으로 이어진다.");
    }
    await page.locator("#commit-pair").click();
  }

  await page.waitForSelector('[data-self-phase="after"]');
  await chooseAll(page, "data-self-item", SELF_ASSESSMENT_ITEMS.map((item) => item.id), 3);
  await page.locator("#self-evidence").fill("현재 보이는 마모와 작품 캡션의 내용이 문제의식을 분명하게 연결한다.");
  await page.locator("#self-submit").click();
  await page.locator('[data-change-reason-code="same_basis"]').click();
  await page.locator("#change-reason").fill("처음과 같은 점수를 유지했으며 작품 안의 흔적과 설명이 여전히 일관된 핵심 근거였다.");
  await page.locator("#change-submit").click();

  await page.locator("#start-ai").click();
  for (let index = 0; index < 6; index += 1) {
    await chooseAll(page, "data-ai-item", AI_RATING_ITEMS.map((item) => item.id), 3);
    await page.locator("#ai-form button[type=submit]").click();
  }
  await page.waitForSelector("#download-json");

  const record = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(record.status, "done");
  assert.equal(Object.keys(record.pre.answers).length, 20);
  assert.equal(Object.keys(record.selfAssessment.before.scores).length, 5);
  assert.ok(record.selfAssessment.before.submittedAt);
  assert.equal(Object.keys(record.selfAssessment.after.scores).length, 5);
  assert.ok(record.selfAssessment.after.currentLockedAt);
  assert.ok(record.selfAssessment.after.submittedAt);
  assert.equal(record.selfAssessment.after.deltaClass, "same");
  assert.equal(record.selfAssessment.after.changeReasonCode, "same_basis");
  assert.equal(record.selfAssessment.ownWorkId, "W01");
  assert.equal(record.selfAssessment.rubricVersion, SELF_ASSESSMENT_VERSION);
  assert.equal(record.pairwise.trials.length, 12);
  assert.equal(record.pairwise.trials.filter((trial) => !trial.repeatOf).length, 11);
  assert.equal(record.pairwise.trials.filter((trial) => trial.repeatOf).length, 1);
  assert.equal(record.pairwise.trials.every((trial) => !Object.hasOwn(trial, "score")), true);
  assert.equal(record.aiRatings.items.length, 6);

  await page.goto(BASE_URL + "?stage=selfBefore");
  await page.waitForSelector("#continue-after-before");
  assert.equal(await page.locator("#self-form").count(), 0);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(BASE_URL + "?stage=pair");
  await mobilePage.locator("[data-choose-work]").first().click();
  assert.equal(await mobilePage.locator("[data-confidence]").count(), 0);
  await mobilePage.locator("[data-choose-work]").last().scrollIntoViewIfNeeded();
  await mobilePage.waitForFunction(() => {
    const raw = localStorage.getItem("museum.pairwiseResearch.prototype.r3");
    return raw && JSON.parse(raw).pairwise.draft?.bothSeenAt;
  });
  await mobilePage.locator("[data-choose-work]").first().click();
  await mobilePage.waitForSelector("[data-confidence]");
  assert.equal((await mobilePage.locator(".confidence-options").innerText()).includes("1"), false);
  await mobile.close();

  const keyboard = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const keyboardPage = await keyboard.newPage();
  await keyboardPage.goto(BASE_URL + "?stage=selfBefore");
  const firstRadio = keyboardPage.locator('[data-self-item="overall"][data-value="1"]');
  await firstRadio.focus();
  await firstRadio.press("ArrowRight");
  assert.equal(await keyboardPage.locator('[data-self-item="overall"][data-value="2"]').getAttribute("aria-checked"), "true");
  await keyboard.close();

  console.log("prototype e2e: full 6-stage flow, 12 comparisons, self-score lock, mobile gate, keyboard controls passed");
} finally {
  await browser.close();
}
