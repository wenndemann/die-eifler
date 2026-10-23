// Hilfsklasse: ein InstancedMesh, das bei Bedarf wächst und jeden Frame neu gefüllt wird (Fahnen, Träger, Waren,
// Gebäude). Ein Draw-Call je Satz, egal wie viele Instanzen.
import * as THREE from 'three';

export class Instanzen {
  mesh: THREE.InstancedMesh;
  n = 0;
  private kap: number;
  private extra: { name: string; size: number; attr: THREE.InstancedBufferAttribute }[] = [];

  /** extra: zusätzliche Instanz-Attribute (Name, Komponenten), z. B. Animationsphase für den Vertex-Shader. */
  constructor(private group: THREE.Object3D, readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material,
    private mitFarbe = false, private schatten = true, extra: { name: string; size: number }[] = [], kap = 64) {
    this.kap = kap;
    this.extra = extra.map((e) => ({ ...e, attr: new THREE.InstancedBufferAttribute(new Float32Array(kap * e.size), e.size) }));
    this.mesh = this.neu(kap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(this.mesh);
  }

  private neu(kap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, kap);
    m.frustumCulled = false;
    m.castShadow = this.schatten;
    m.receiveShadow = true;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.mitFarbe) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(kap * 3).fill(1), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    for (const e of this.extra) this.geo.setAttribute(e.name, e.attr);
    return m;
  }

  private waechst() {
    const alt = this.mesh;
    this.kap *= 2;
    const m = this.neu(this.kap);
    (m.instanceMatrix.array as Float32Array).set(alt.instanceMatrix.array as Float32Array);
    if (alt.instanceColor && m.instanceColor) (m.instanceColor.array as Float32Array).set(alt.instanceColor.array as Float32Array);
    for (const e of this.extra) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.kap * e.size), e.size);
      a.array.set(e.attr.array as Float32Array);
      a.setUsage(THREE.DynamicDrawUsage);
      e.attr = a;
      this.geo.setAttribute(e.name, a);
    }
    this.group.remove(alt);
    alt.dispose();
    this.group.add(m);
    this.mesh = m;
  }

  beginne() { this.n = 0; }

  fuege(m: THREE.Matrix4, farbe?: THREE.Color, extra?: number[]) {
    if (this.n >= this.kap) this.waechst();
    this.mesh.setMatrixAt(this.n, m);
    if (farbe && this.mesh.instanceColor) this.mesh.setColorAt(this.n, farbe);
    if (extra) {
      // Werte der Reihe nach auf die Attribute verteilen (laufender Versatz; fehlende Werte sind 0)
      let off = 0;
      for (const e of this.extra) {
        for (let c = 0; c < e.size; c++) (e.attr.array as Float32Array)[this.n * e.size + c] = extra[off + c] ?? 0;
        off += e.size;
      }
    }
    this.n++;
  }

  fertig() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const e of this.extra) e.attr.needsUpdate = true;
  }
}
