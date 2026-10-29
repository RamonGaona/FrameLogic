export class GeneralPdfTreeInteractionController {
  private readonly container: HTMLElement;
  private readonly timer: number;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.addEventListener(
      "click",
      this.handleClick,
      true,
    );
    this.decorate();
    this.timer = window.setInterval(
      () => this.decorate(),
      300,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.container.removeEventListener(
      "click",
      this.handleClick,
      true,
    );
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target
      : null;
    const row = target?.closest<HTMLDivElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"] > div',
    );
    if (!row) return;

    // El PDF se abre con dblclick. Bloqueamos los dos click que el navegador
    // emite antes del dblclick para evitar abrir la hoja por un clic accidental.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private decorate(): void {
    if (this.disposed) return;
    const rows = this.container.querySelectorAll<HTMLDivElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"] > div',
    );

    for (const row of rows) {
      row.title = "Doble clic = abrir PDF";
      const spans = Array.from(row.children).filter(
        (child): child is HTMLSpanElement =>
          child instanceof HTMLSpanElement,
      );
      const type = spans.at(-1);
      if (
        type
        && (
          type.textContent === "SECCIÓN"
          || type.textContent === "ENSAMBLE"
        )
      ) {
        type.textContent = "PDF";
      }
    }
  }
}
