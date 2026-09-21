export interface ContainerOptions {
  borderRadius?: number;
  type?: 'rounded' | 'circle' | 'pill';
  tintOpacity?: number;
}
export class Container {
  static html2canvas: ((el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>) | null;
  static onError: ((e: unknown) => void) | null;
  static instances: Container[];
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  webglInitialized: boolean;
  render?: () => void;
  constructor(options?: ContainerOptions);
  updateSizeFromDOM(): void;
  destroy(): void;
}
