// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CaseSubnav } from "../components/firstfault/CaseSubnav";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return rule.type === CSSRule.STYLE_RULE;
}

afterEach(cleanup);

describe("mobile case navigation CSS", () => {
  it("keeps every case section visible in a two-column mobile layout", () => {
    const { container } = render(<CaseSubnav contractVersion="v3" hasWorkflow recoveryAvailable={false} />);
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);

    const mobileRules = Array.from(style.sheet!.cssRules)
      .filter((rule) => (rule as CSSMediaRule).conditionText?.replaceAll(" ", "") === "(max-width:620px)")
      .flatMap((rule) => Array.from((rule as CSSMediaRule).cssRules));
    const items = Array.from(container.querySelectorAll(".ff-subnav-item, .ff-frozen"));
    const hiddenSelectors = mobileRules
      .filter(isStyleRule)
      .filter((rule) => rule.style.display === "none")
      .map((rule) => rule.selectorText)
      .filter((selector) => items.some((item) => item.matches(selector)));
    const shellRule = mobileRules.find((rule) =>
      isStyleRule(rule) && rule.selectorText === ".ff-subnav .ff-shell",
    ) as CSSStyleRule | undefined;
    const statusRule = mobileRules.find((rule) =>
      isStyleRule(rule) && rule.selectorText === ".ff-subnav .ff-frozen",
    ) as CSSStyleRule | undefined;

    expect(hiddenSelectors).toEqual([]);
    expect(shellRule?.style.display).toBe("grid");
    expect(shellRule?.style.getPropertyValue("grid-template-columns")).toBe("repeat(2,minmax(0,1fr))");
    expect(statusRule?.style.getPropertyValue("grid-column")).toBe("1/-1");
    style.remove();
  });
});
