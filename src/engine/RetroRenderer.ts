import * as THREE from 'three';

/**
 * Renders the scene into a small render target, then blits it to the canvas
 * with nearest-neighbour filtering for the chunky mid-90s look. Optional
 * "DOS mode" reduces the palette with a 4x4 ordered dither (at the low
 * resolution, so the dither pattern is chunky too) and adds faint scanlines.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private blitScene = new THREE.Scene();
  private blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blit: THREE.ShaderMaterial;

  /** lowHeight = internal vertical resolution; width follows the window aspect. */
  constructor(private lowHeight = 270) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    document.body.appendChild(this.renderer.domElement);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.blit = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.target.texture },
        lowRes: { value: new THREE.Vector2(1, 1) },
        dos: { value: 0 },
        levels: { value: 6 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec2 lowRes;
        uniform float dos;
        uniform float levels;
        varying vec2 vUv;
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return (float(m[i]) + 0.5) / 16.0;
        }
        void main() {
          gl_FragColor = texture2D(map, vUv);
          #include <colorspace_fragment>
          if (dos > 0.5) {
            // Quantise in display (sRGB) space, dithered per low-res pixel.
            float t = bayer4(floor(vUv * lowRes)) - 0.5;
            gl_FragColor.rgb = floor(gl_FragColor.rgb * (levels - 1.0) + 0.5 + t) / (levels - 1.0);
            gl_FragColor.rgb *= mod(floor(gl_FragCoord.y), 2.0) < 1.0 ? 0.9 : 1.0;
          }
        }`,
    });
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blit));
  }

  setLowHeight(h: number) {
    this.lowHeight = h;
  }

  setDosMode(on: boolean) {
    this.blit.uniforms.dos.value = on ? 1 : 0;
  }

  resize(camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const lowW = Math.round((this.lowHeight * w) / h);
    this.target.setSize(lowW, this.lowHeight);
    this.blit.uniforms.lowRes.value.set(lowW, this.lowHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  get internalSize() {
    return { w: this.target.width, h: this.target.height };
  }

  /** Draw calls / triangles of the last scene render (for the performance overlay). */
  stats = { calls: 0, triangles: 0 };

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }
}
