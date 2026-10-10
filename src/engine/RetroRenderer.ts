import * as THREE from 'three';

/**
 * Renders the scene into a small render target, then blits it to the canvas
 * with nearest-neighbour filtering for the chunky mid-90s look.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private blitScene = new THREE.Scene();
  private blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /** lowHeight = internal vertical resolution; width follows the window aspect. */
  constructor(private lowHeight = 270) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    document.body.appendChild(this.renderer.domElement);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.target.texture }),
    );
    this.blitScene.add(quad);
  }

  setLowHeight(h: number) {
    this.lowHeight = h;
  }

  resize(camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const lowW = Math.round((this.lowHeight * w) / h);
    this.target.setSize(lowW, this.lowHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  get internalSize() {
    return { w: this.target.width, h: this.target.height };
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }
}
