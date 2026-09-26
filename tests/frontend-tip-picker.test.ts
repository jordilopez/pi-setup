/**
 * Tests for the topic-picker logic of the frontend_tip_pick_topic tool.
 *
 * Run with: node --experimental-strip-types --test tests/frontend-tip-picker.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_TOPICS, pickTopic } from "../extensions/llm-tools/frontend-tip-picker.ts";

describe("pickTopic", () => {
  it("returns the named topic when the user named one", () => {
    const result = pickTopic({ namedTopic: "Vue", coveredEntries: [] });
    assert.equal(result.pickedTopic, "Vue");
    assert.equal(result.wasNamed, true);
    assert.equal(result.wrapped, false);
  });

  it("picks the first uncovered default topic with an empty log", () => {
    const result = pickTopic({ namedTopic: undefined, coveredEntries: [] });
    assert.equal(result.pickedTopic, DEFAULT_TOPICS[0]);
    assert.equal(result.wasNamed, false);
    assert.equal(result.coveredLogSize, 0);
  });

  it("skips topics already recorded in the log", () => {
    const covered = [
      { date: "2025-09-01", topic: DEFAULT_TOPICS[0], title: "first" },
      { date: "2025-09-02", topic: DEFAULT_TOPICS[1], title: "second" },
    ];
    const result = pickTopic({ namedTopic: undefined, coveredEntries: covered });
    assert.equal(result.pickedTopic, DEFAULT_TOPICS[2]);
    assert.equal(result.coveredLogSize, 2);
  });

  it("wraps to the least-recently-covered topic once all defaults are covered", () => {
    const covered = DEFAULT_TOPICS.map((topic, i) => ({
      date: `2025-09-${String(i + 1).padStart(2, "0")}`,
      topic,
      title: `tip ${i}`,
    }));
    const result = pickTopic({ namedTopic: undefined, coveredEntries: covered });
    assert.equal(result.wrapped, true);
    // least-recently-covered = the entry with the oldest date
    assert.equal(result.pickedTopic, covered[0].topic);
  });

  it("ignores covered entries whose topic is not in the default list", () => {
    const covered = [
      { date: "2025-09-01", topic: "NotARealTopic", title: "weird" },
      { date: "2025-09-02", topic: DEFAULT_TOPICS[0], title: "real" },
    ];
    const result = pickTopic({ namedTopic: undefined, coveredEntries: covered });
    assert.equal(result.pickedTopic, DEFAULT_TOPICS[1]);
    assert.equal(result.coveredLogSize, 1, "only default-list topics count towards coverage");
  });
});
