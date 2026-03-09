export type UiAuditSeverity = "P0" | "P1" | "P2" | "P3";

export type GoodUiRule = {
    id: string;
    title: string;
    principle: string;
    weight: number;
    defaultSeverity: UiAuditSeverity;
    evidence: "selector" | "metric" | "screenshot" | "code";
};

export const GOOD_UI_RULES: GoodUiRule[] = [
    {
        id: "good-ui.hierarchy",
        title: "Clear visual hierarchy",
        principle: "establish hierarchy, speed up hierarchy, create visual pathways",
        weight: 9,
        defaultSeverity: "P2",
        evidence: "screenshot",
    },
    {
        id: "good-ui.density",
        title: "Intentional density and spacing",
        principle: "be denser than usual, space related things similarly, amplify spacing differences",
        weight: 6,
        defaultSeverity: "P2",
        evidence: "screenshot",
    },
    {
        id: "friction.control-density",
        title: "Primary workflows avoid overloaded control density",
        principle: "frequent workflows should expose only high-frequency actions and collapse secondary controls",
        weight: 9,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "good-ui.cta-clarity",
        title: "CTA hierarchy and defaults",
        principle: "clarify CTA hierarchy, supercharge defaults",
        weight: 8,
        defaultSeverity: "P1",
        evidence: "screenshot",
    },
    {
        id: "good-ui.readability",
        title: "Readable typography and line length",
        principle: "avoid centered long text, constrain line length",
        weight: 6,
        defaultSeverity: "P2",
        evidence: "code",
    },
    {
        id: "good-ui.visual-consistency",
        title: "Consistent shape/elevation/state language",
        principle: "consistent radius, borders, shadows, icon/text balance",
        weight: 7,
        defaultSeverity: "P2",
        evidence: "code",
    },
    {
        id: "spacing.scale-consistency",
        title: "Spacing scale consistency",
        principle: "prefer spacing tokens over arbitrary padding/margin/gap values",
        weight: 7,
        defaultSeverity: "P2",
        evidence: "code",
    },
    {
        id: "spacing.inline-style-drift",
        title: "Avoid inline spacing drift",
        principle: "avoid non-token margin/padding in inline style objects",
        weight: 6,
        defaultSeverity: "P2",
        evidence: "code",
    },
    {
        id: "a11y.contrast",
        title: "Contrast meets WCAG AA",
        principle: "text/icons maintain sufficient contrast",
        weight: 10,
        defaultSeverity: "P0",
        evidence: "metric",
    },
    {
        id: "a11y.target-size",
        title: "Interactive targets meet minimum size",
        principle: "touch/click targets are large enough for reliable interaction",
        weight: 10,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "a11y.focus-visible",
        title: "Focus visibility for keyboard users",
        principle: "all keyboard focusable controls expose visible focus",
        weight: 10,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "a11y.control-name",
        title: "Interactive controls expose accessible names",
        principle: "button-like controls should always have an understandable accessible name",
        weight: 10,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "layout.no-horizontal-overflow",
        title: "No unintended horizontal overflow",
        principle: "prevent clipped UI and off-screen actions",
        weight: 8,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "layout.mobile-primary-content-overflow",
        title: "Primary mobile content should not require horizontal panning",
        principle: "core workflows on mobile should keep primary actions visible without sideways scrolling",
        weight: 9,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "flow.confirmation-consistency",
        title: "Destructive confirmations should use consistent app dialogs",
        principle: "avoid native confirm prompts that break UX and accessibility consistency",
        weight: 8,
        defaultSeverity: "P1",
        evidence: "code",
    },
    {
        id: "audit.route-error-state",
        title: "Authenticated routes should not load in generic error state by default",
        principle: "audit baseline must represent healthy route rendering before scoring visual quality",
        weight: 8,
        defaultSeverity: "P1",
        evidence: "metric",
    },
    {
        id: "friction.telemetry-signal-quality",
        title: "Friction telemetry remains intent-qualified and actionable",
        principle: "time-to-task metrics should separate passive browsing exits from intent-qualified outcomes",
        weight: 7,
        defaultSeverity: "P2",
        evidence: "metric",
    },
    {
        id: "content.intentional-truncation",
        title: "Truncation is intentional and recoverable",
        principle: "critical labels should expose full value via title/tooltip",
        weight: 5,
        defaultSeverity: "P2",
        evidence: "metric",
    },
];

export const GOOD_UI_RULE_MAP = Object.fromEntries(
    GOOD_UI_RULES.map((rule) => [rule.id, rule]),
) as Record<string, GoodUiRule>;
