---
title: Ray Tracer
order: 6
featured: false
summary: Sphere renderer written in C with no external libraries
location:
  lat: 53.52
  lon: -113.53
  label: University of Alberta
stack:
  - C
links:
  github: https://github.com/anantguptaa/basic-ray-tracer
---

- Implemented a modular ray tracer in C with separate vector, sphere and colour components.
- Added ray-sphere intersection, lighting and shadow calculations for scenes with multiple spheres.
- Implemented grid-sampled anti-aliasing to reduce jagged edges in rendered images.
- Built an input-driven scene format for configuring image dimensions, camera, lights, colours and spheres.
- Generated rendered scenes as portable PPM images using a Makefile-based build.
