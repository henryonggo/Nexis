# Design System Master File - Nexis

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Nexis
**Generated:** 2026-06-16
**Category:** HR & Payroll SaaS / Fintech

---

## 1. Global Design Tokens

### Color Palette

| Role | Hex Code | CSS Custom Property | Visual Application |
|---|---|---|---|
| **Primary** | `#4F46E5` | `--color-primary` | Main buttons, navigation icons, sidebar active state |
| **Secondary** | `#818CF8` | `--color-secondary` | Hover states, card sub-highlights |
| **CTA / Success** | `#10B981` | `--color-success` | "Run Payroll" button, checked-in badges, positive changes |
| **Warning / Limit**| `#F59E0B` | `--color-warning` | Pending approvals, free tier threshold warnings (4/5 seats) |
| **Danger / Alert** | `#EF4444` | `--color-danger` | Failed check-ins, deleted actions, audit flags |
| **Background** | `#F8FAFC` | `--color-background` | Application canvas background (slate-50) |
| **Card / Canvas** | `#FFFFFF` | `--color-card` | White backgrounds for bento grids and content |
| **Text Primary** | `#0F172A` | `--color-text` | Main headers, large amounts, navigation labels (slate-900) |
| **Text Muted** | `#475569` | `--color-text-muted` | Secondary headers, column labels, help tooltips (slate-600) |

### Typography

* **Primary Font (Headings & Body):** **Plus Jakarta Sans**
* **Monospace Font (Numbers & Tables):** **Fira Code** (or standard monospace fallback)
* **Google Fonts Import URL:** [Plus Jakarta Sans + Fira Code](https://fonts.google.com/share?selection.family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800|Fira+Code:wght@400;500)

**CSS Import Rule:**
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap');
```

### Spacing Scale

| Token | Value | Tailwind Class | Application |
|---|---|---|---|
| `--space-xs` | `4px` / `0.25rem` | `p-1` / `m-1` | Tight spaces, inline badges |
| `--space-sm` | `8px` / `0.5rem` | `p-2` / `m-2` | Icon-to-text spacing, button padding |
| `--space-md` | `16px` / `1rem` | `p-4` / `m-4` | Inner card padding, standard grid gaps |
| `--space-lg` | `24px` / `1.5rem` | `p-6` / `m-6` | Major section containers, page headers |
| `--space-xl` | `32px` / `2rem` | `p-8` / `m-8` | Large margins between layouts |

### Elevation & Shadows

| Level | Value | Tailwind Utility | Application |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `shadow-sm` | Subtle card borders, input fields |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.08)` | `shadow` | Dashboard bento box cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | `shadow-lg` | Popovers, sidebar tenant switcher dropdowns |

---

## 2. Component Layout & Interaction Specifications

### Buttons
```css
/* Primary Action Button (CTA/Success Focus) */
.btn-primary {
  background-color: var(--color-success); /* #10B981 */
  color: #FFFFFF;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 200ms ease, transform 150ms ease;
  border: none;
}

.btn-primary:hover {
  background-color: #059669; /* Darker emerald */
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
}

/* Secondary Button (Outline Style) */
.btn-secondary {
  background-color: transparent;
  color: var(--color-primary); /* #4F46E5 */
  border: 1.5px solid var(--color-primary);
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
}

.btn-secondary:hover {
  background-color: var(--color-primary-light); /* #EEF2F6 */
  border-color: var(--color-secondary);
}
```

### Bento Cards
```css
.bento-card {
  background-color: var(--color-card); /* #FFFFFF */
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  border: 1px solid #E2E8F0; /* slate-200 */
  transition: box-shadow 200ms ease, transform 200ms ease;
}

.bento-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Input Fields
```css
.text-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #CBD5E1; /* slate-300 */
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

.text-input:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}
```

---

## 3. Mandatory UI/UX Standards

### ❌ Anti-Patterns to Avoid (Strictly Enforced)
1. **Emojis as Icons:** Do NOT use emojis like ⏰, 💰, ⚙️, or 🚀. All icons must be unified SVGs from Lucide or Heroicons.
2. **Missing cursor-pointer:** Ensure all hoverable cards, list rows, toggle triggers, and buttons explicitly carry `cursor-pointer`.
3. **Layout Shifting on Hover:** Hover animations must NOT scale the card in a way that shifts siblings or triggers browser reflow (use shadow shifts or subtle relative translate-y).
4. **Low Contrast Text:** Gray text must maintain a minimum contrast ratio of `4.5:1` against white backgrounds (do not use anything lighter than `text-slate-500` for body/labels).

### 🛠️ Pre-Delivery Checklist
- [ ] No emojis as icons (use Lucide/Heroicons SVGs).
- [ ] Hover transitions are smooth and defined (150-250ms).
- [ ] Form labels are linked to their corresponding inputs with `htmlFor` or nested scopes.
- [ ] UI is fully responsive and verified at `375px`, `768px`, `1024px`, and `1440px`.
- [ ] Inactive elements have clear disabled states.
