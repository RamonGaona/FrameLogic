/**
 * Shared keyboard-first choice state for CAD command menus.
 *
 * The FIRST enabled option is selected immediately when a menu opens.
 * Enter confirms the current option (or the first when none is selected),
 * while arrows/Tab change the preview without activating a command.
 * Mouse clicks on the existing buttons keep working.
 */
export class CadCommandDefaultChoice {
  private selectedIndex = -1;

  private readonly buttons: readonly HTMLButtonElement[];

  constructor(buttons: readonly HTMLButtonElement[]) {
    this.buttons = buttons;
    this.reset();
  }

  get currentIndex(): number {
    return this.selectedIndex;
  }

  reset(): void {
    this.select(this.firstAvailableIndex());
  }

  private firstAvailableIndex(): number {
    return this.buttons.findIndex((button) => !button.disabled && !button.hidden);
  }

  select(index: number): boolean {
    if (index < 0 || index >= this.buttons.length) return false;
    const candidate = this.buttons[index];
    if (!candidate || candidate.disabled || candidate.hidden) return false;
    this.selectedIndex = index;
    this.refresh();
    return true;
  }

  move(delta: 1 | -1): void {
    if (!this.buttons.length) return;
    const start = this.selectedIndex < 0 ? this.firstAvailableIndex() : this.selectedIndex;
    if (start < 0) return;
    for (let step = 1; step <= this.buttons.length; step += 1) {
      const next = (start + step * delta + this.buttons.length * (step + 1)) % this.buttons.length;
      if (this.select(next)) return;
    }
  }

  confirm(): boolean {
    if (this.selectedIndex < 0 && this.firstAvailableIndex() >= 0) this.reset();
    const button = this.buttons[this.selectedIndex];
    if (!button || button.disabled || button.hidden) return false;
    button.click();
    return true;
  }

  /** Return true only if an option-key event was handled. */
  handleKey(key: string, shiftKey = false): boolean {
    if (key === "Enter") return this.confirm();
    if (key === "ArrowDown" || key === "ArrowRight" || key === "Tab") {
      this.move(key === "Tab" && shiftKey ? -1 : 1);
      return true;
    }
    if (key === "ArrowUp" || key === "ArrowLeft") {
      this.move(-1);
      return true;
    }
    if (key === "Home") {
      this.reset();
      return true;
    }
    if (key === "End") {
      for (let i = this.buttons.length - 1; i >= 0; i -= 1) {
        if (this.select(i)) break;
      }
      return true;
    }
    return false;
  }

  private refresh(): void {
    this.buttons.forEach((button, index) => {
      const selected = index === this.selectedIndex;
      button.setAttribute("aria-pressed", String(selected));
      button.dataset["defaultOptionSelected"] = String(selected);
      button.style.background = selected ? "#24668d" : "#263944";
      button.style.borderColor = selected
        ? "rgba(125,211,252,0.95)"
        : "rgba(255,255,255,0.18)";
      button.style.fontWeight = selected ? "700" : "400";
    });
  }
}
