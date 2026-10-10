import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Assets } from '../engine/Assets';
import { createTrackScene } from '../game/TrackScene';
import { Track } from '../track/Track';
import { buildTrackMeshes } from '../track/TrackMesh';
import { validateTrack, type TrackIssue } from '../track/Validate';
import { getTheme } from '../world/Themes';
import type { EditorState } from './EditorState';

const SCENERY = ['terrain', 'props', 'water'];

/**
 * 3D editing viewport: orbit/pan camera, control-point handles, dragging,
 * inserting and deleting points, live road rebuilds and issue markers.
 */
export class Editor {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly camera = new THREE.PerspectiveCamera(50, 1, 1, 6000);
  readonly controls: OrbitControls;
  previewScenery = true;
  issues: TrackIssue[] = [];
  track: Track | null = null;
  onIssues: ((issues: TrackIssue[]) => void) | null = null;

  private scene = new THREE.Scene();
  private handles = new THREE.Group();
  private markers = new THREE.Group();
  private grid = new THREE.GridHelper(4000, 200, 0x445566, 0x334455);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private drag: { index: number; mode: 'move' | 'height'; plane: THREE.Plane; startY: number; startPointerY: number; offset: THREE.Vector3 } | null = null;
  private rebuildTimer: number | null = null;
  private handleGeo = new THREE.BoxGeometry(1, 1, 1);
  private handleMats = {
    normal: new THREE.MeshBasicMaterial({ color: 0xffd020, depthTest: false }),
    start: new THREE.MeshBasicMaterial({ color: 0x20e060, depthTest: false }),
    selected: new THREE.MeshBasicMaterial({ color: 0xff3030, depthTest: false }),
  };

  constructor(
    private container: HTMLElement,
    private assets: Assets,
    private state: EditorState,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Left button is for editing; right = pan, middle = rotate, wheel = zoom.
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.handles.renderOrder = 10;
    this.markers.renderOrder = 11;

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.rebuild(true);
    this.topView();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Frame the whole track from above. */
  topView() {
    const box = new THREE.Box3();
    for (const c of this.state.points) box.expandByPoint(new THREE.Vector3(...c.p));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.z) * 1.1 + 80;
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + dist, center.z - dist * 0.25);
    this.controls.update();
  }

  /** Full rebuild (track + scenery) or a fast road-only rebuild while dragging. */
  rebuild(full: boolean) {
    const data = this.state.data;
    let track: Track;
    try {
      track = new Track(data);
    } catch (err) {
      console.warn('Track build failed', err);
      return;
    }
    this.track = track;
    const theme = getTheme(data.theme);

    if (full) {
      disposeScene(this.scene);
      const world = createTrackScene(track, this.assets, theme);
      this.scene = world.scene;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(theme.fog.color).multiplyScalar(0.8);
      this.scene.getObjectByName('sky')!.visible = false;
      this.scene.add(this.handles, this.markers, this.grid);
      this.setSceneryVisible(this.previewScenery);
      this.issues = validateTrack(track);
      this.updateMarkers();
      this.onIssues?.(this.issues);
    } else {
      const old = this.scene.getObjectByName('track');
      if (old) {
        disposeObject(old);
        this.scene.remove(old);
      }
      this.scene.add(buildTrackMeshes(track, theme));
      this.setSceneryVisible(false);
      this.markers.clear();
    }
    this.updateHandles();
  }

  /** Schedule a full rebuild shortly (coalesces bursts of commits). */
  scheduleRebuild() {
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuild(true);
    }, 60);
  }

  setSceneryVisible(visible: boolean) {
    for (const name of SCENERY) {
      const o = this.scene.getObjectByName(name);
      if (o) o.visible = visible;
    }
    this.grid.visible = !visible;
  }

  /** Distance along the lap of the selected point (or 0), for "test drive from here". */
  selectedDistance() {
    const i = this.state.selected;
    if (i === null || !this.track) return 0;
    const [x, , z] = this.state.points[i].p;
    return this.track.locate(x, z, null).dist;
  }

  // --- handles & markers ------------------------------------------------------

  updateHandles() {
    const pts = this.state.points;
    while (this.handles.children.length > pts.length) this.handles.remove(this.handles.children[this.handles.children.length - 1]);
    while (this.handles.children.length < pts.length) this.handles.add(new THREE.Mesh(this.handleGeo, this.handleMats.normal));
    pts.forEach((c, i) => {
      const h = this.handles.children[i] as THREE.Mesh;
      h.position.set(c.p[0], c.p[1] + 1.5, c.p[2]);
      h.material = i === this.state.selected ? this.handleMats.selected : i === 0 ? this.handleMats.start : this.handleMats.normal;
      h.userData.index = i;
      h.renderOrder = 10;
    });
  }

  private updateMarkers() {
    this.markers.clear();
    const geo = new THREE.ConeGeometry(1, 2.5, 4).rotateX(Math.PI);
    for (const issue of this.issues) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: issue.level === 'error' ? 0xff2020 : 0xff9020, depthTest: false }));
      m.position.set(issue.at[0], issue.at[1] + 8, issue.at[2]);
      m.renderOrder = 11;
      m.userData.scaleBase = 1;
      this.markers.add(m);
    }
  }

  private frame() {
    this.controls.update();
    // Keep handles and markers a constant size on screen.
    const scaleFor = (o: THREE.Object3D, px: number) => o.scale.setScalar(Math.max(1.5, o.position.distanceTo(this.camera.position) * px));
    for (const h of this.handles.children) scaleFor(h, 0.018);
    for (const m of this.markers.children) scaleFor(m, 0.02);
    this.renderer.render(this.scene, this.camera);
  }

  // --- input -------------------------------------------------------------------

  private setPointer(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.setPointer(e);
    const hit = this.raycaster.intersectObjects(this.handles.children, false)[0];
    if (!hit) {
      this.state.select(null);
      return;
    }
    const index = hit.object.userData.index as number;
    const p = this.state.points[index].p;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -p[1]);
    const onPlane = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    this.drag = {
      index,
      mode: e.shiftKey ? 'height' : 'move',
      plane,
      startY: p[1],
      startPointerY: e.clientY,
      offset: onPlane ? new THREE.Vector3(p[0], p[1], p[2]).sub(onPlane) : new THREE.Vector3(),
    };
    this.state.select(index);
    this.state.begin();
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const d = this.drag;
    const p = this.state.points[d.index].p;
    if (d.mode === 'height') {
      // Vertical mouse movement → height, scaled by camera distance.
      const dist = this.camera.position.distanceTo(new THREE.Vector3(...p));
      const y = d.startY + ((d.startPointerY - e.clientY) * dist) / 800;
      this.state.setPosition(d.index, p[0], y, p[2]);
    } else {
      this.setPointer(e);
      const hit = this.raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
      if (!hit) return;
      hit.add(d.offset);
      this.state.setPosition(d.index, hit.x, p[1], hit.z);
    }
    this.state.live();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag) return;
    this.renderer.domElement.releasePointerCapture(e.pointerId);
    this.drag = null;
    this.state.end();
    // A drag that changed nothing still needs scenery back on.
    this.scheduleRebuild();
  };

  private onDoubleClick = (e: MouseEvent) => {
    this.setPointer(e);
    if (this.raycaster.intersectObjects(this.handles.children, false).length) return;
    // Aim at the average track height.
    const avgY = this.state.points.reduce((a, c) => a + c.p[1], 0) / this.state.points.length;
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -avgY), new THREE.Vector3());
    if (hit) this.state.insertAt(hit.x, hit.z);
  };
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose();
  });
}

/** Dispose generated geometry (track, terrain, sky) but not shared asset geometry used by props. */
function disposeScene(scene: THREE.Scene) {
  for (const name of ['track', 'terrain', 'sky']) {
    const o = scene.getObjectByName(name);
    if (o) disposeObject(o);
  }
}
