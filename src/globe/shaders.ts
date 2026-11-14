/**
 * Based on vertex-earth by Bobby Roe:
 * https://github.com/bobbyroe/vertex-earth
 * MIT License, Copyright (c) 2024 Bobby Roe.
 */

/**
 * Globe shaders (GLSL), kept as strings and handed to a Three.js ShaderMaterial.
 *
 * A shader is a small program that runs on the graphics card:
 *  - the VERTEX shader runs once per point and decides where it goes on screen and how big it is;
 *  - the FRAGMENT shader runs once per pixel of each point and decides that pixel's colour.
 *
 * Three.js adds some declarations for us before these run: `position` (the point's place on
 * the sphere), `modelViewMatrix`, `projectionMatrix` and `normalMatrix`.
 *
 * Technique after bobbyroe/vertex-earth (MIT), rebuilt: lat/lon is worked out from the point's
 * position (no seam), and elevation lifts points along the surface normal.
 */

export const vertexShader = /* glsl */ `
  // "uniform" = a value sent in from Globe.ts, the same for every point.
  uniform sampler2D uLandMask;      // the land mask image: white = land, black = ocean
  uniform sampler2D uElevationMap;  // optional height image (1×1 black until one is supplied)
  uniform float uElevationScale;    // how far land is lifted, in globe radii (0 = flat)
  uniform float uSize;              // dot diameter in CSS pixels
  uniform float uPixelRatio;        // device pixels per CSS pixel (capped at 2)

  // "varying" = a value handed from this shader to the fragment shader.
  varying float vLand;    // 0…1: how much this point is land
  varying float vFacing;  // > 0: point faces the camera; < 0: it is on the far side

  const float PI = 3.141592653589793;

  void main() {
    // The point's direction from the globe's centre. On a sphere this is also the surface
    // normal: the direction pointing straight "up" out of the ground at that spot.
    vec3 normal = normalize(position);

    // Turn that direction into longitude and latitude (in radians).
    // Longitude: the angle around the vertical axis; 0 at +Z, the side that starts facing us.
    // Latitude: how far up or down; asin of the height (y).
    float lon = atan(normal.x, normal.z);              // −PI … PI
    float lat = asin(clamp(normal.y, -1.0, 1.0));      // −PI/2 … PI/2

    // Turn lon/lat into a position on the flat map image, each 0…1.
    // x: −180° is the left edge, +180° the right. y: south pole at 0, north pole at 1.
    // Because this comes from the position itself (not stored UVs), there is no seam.
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);

    // Look up the mask at that spot. Its red channel is 1 on land and 0 on ocean.
    vLand = texture2D(uLandMask, uv).r;

    // Elevation: read the height at the same spot and push the point outwards along the
    // normal, land only. With no elevation image and a scale of 0 this changes nothing.
    float elevation = texture2D(uElevationMap, uv).r * uElevationScale * vLand;
    vec3 displaced = normal * (1.0 + elevation);

    // Move the point from the globe's own space into "view space": where it sits relative
    // to the camera, after the globe's rotation.
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);

    // Is this point on the near side? Rotate the normal the same way, then compare it with
    // the direction from the point to the camera. The dot product is positive when they
    // point the same way (near side) and negative on the far side.
    vec3 viewNormal = normalize(normalMatrix * normal);
    vFacing = dot(viewNormal, normalize(-viewPosition.xyz));

    // Final screen position: apply the camera's perspective.
    gl_Position = projectionMatrix * viewPosition;

    // Dot size in device pixels, so a dot looks the same size on 1× and 2× screens.
    gl_PointSize = uSize * uPixelRatio;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uLandColor;    // --text
  uniform vec3 uOceanColor;   // --text-muted
  uniform float uOceanAlpha;  // 0 = ocean hidden; about 0.3 = dim ocean dots

  varying float vLand;
  varying float vFacing;

  void main() {
    // Far side of the globe: draw nothing.
    if (vFacing < 0.0) discard;

    // Land or ocean? The mask is slightly grey along coasts; 0.5 is the cut-off.
    float isLand = step(0.5, vLand);

    // Each point is drawn as a square. gl_PointCoord runs 0…1 across it, so the distance
    // from (0.5, 0.5) tells us how far this pixel is from the dot's centre.
    float dist = length(gl_PointCoord - 0.5);

    // Make the square a disc: fully solid inside, fading out over the last bit of the radius
    // for a smooth edge. smoothstep(a, b, x) goes 0 → 1 as x goes a → b.
    float disc = 1.0 - smoothstep(0.38, 0.5, dist);

    // Fade dots near the globe's edge. There the surface turns away from us and the dots
    // bunch together on screen; without the fade they merge into a bright streak.
    float limb = smoothstep(0.05, 0.55, vFacing);

    // Ocean only: a wider fade towards the edge. The tightly packed ocean dots there form
    // wavy interference patterns (moiré); fading them removes it. vFacing is 1 facing us
    // and 0 at the edge, so ocean dots are at full strength over the middle of the globe and
    // fade out over the outer part. Land is untouched by this, so coastlines stay crisp.
    float oceanFade = smoothstep(0.15, 0.75, vFacing);

    // Land is fully opaque; ocean uses uOceanAlpha (0 hides it), faded towards the edge.
    float alpha = mix(uOceanAlpha * oceanFade, 1.0, isLand) * disc * limb;
    if (alpha <= 0.003) discard;

    vec3 color = mix(uOceanColor, uLandColor, isLand);
    gl_FragColor = vec4(color, alpha);

    // Three.js works with colours in "linear" form internally; this line converts the result
    // back to normal screen colours, so --text looks exactly like it does in CSS.
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------------------------
 * Pins: one point per pin, drawn as a small disc. The active pin also gets a ring that grows
 * and fades (the "pulse"). Sizes are in CSS pixels, so pins look the same on any screen.
 * ---------------------------------------------------------------------------------------- */

export const pinVertexShader = /* glsl */ `
  attribute float aActive;   // 1 for the active pin, 0 for the others

  uniform float uBoxSize;    // width of the square each pin is drawn in, in CSS pixels
  uniform float uPixelRatio;

  varying float vFacing;
  varying float vActive;

  void main() {
    // Same near-side test as the globe's dots.
    vec3 normal = normalize(position);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * normal), normalize(-viewPosition.xyz));
    vActive = aActive;

    gl_Position = projectionMatrix * viewPosition;
    // A fixed size in pixels: big enough to hold the ring at its largest.
    gl_PointSize = uBoxSize * uPixelRatio;
  }
`;

export const pinFragmentShader = /* glsl */ `
  uniform vec3 uColor;        // --accent
  uniform float uBoxSize;     // as above
  uniform float uDiscRadius;  // disc radius in CSS pixels
  uniform float uPhase;       // 0 → 1 over one pulse (1.8s); fixed under reduced motion
  uniform float uHasActive;   // 1 when some pin is active (then the others are dimmed)

  varying float vFacing;
  varying float vActive;

  void main() {
    // Far side of the globe: hidden.
    if (vFacing < 0.0) discard;

    // Distance of this pixel from the pin's centre, in CSS pixels.
    float r = length(gl_PointCoord - 0.5) * uBoxSize;

    // The solid disc, with a soft one-pixel edge.
    float disc = 1.0 - smoothstep(uDiscRadius - 0.6, uDiscRadius + 0.6, r);

    // The ring (active pin only): its radius grows from the disc's edge to the edge of the
    // box as uPhase goes 0 → 1, and it fades out as it grows.
    float ringRadius = mix(uDiscRadius, uBoxSize * 0.5 - 1.5, uPhase);
    float ring = (1.0 - smoothstep(0.4, 1.2, abs(r - ringRadius))) * (1.0 - uPhase) * vActive;

    // Non-active pins draw at 55% while another pin is active.
    float dim = mix(1.0, mix(0.55, 1.0, vActive), uHasActive);

    // Fade out as the pin nears the globe's edge.
    float limb = smoothstep(0.0, 0.2, vFacing);

    float alpha = max(disc * dim, ring) * limb;
    if (alpha <= 0.003) discard;

    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;
