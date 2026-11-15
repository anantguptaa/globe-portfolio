---
title: EDSS Navigator
order: 3
featured: true
summary: Cross-platform app for the Edmonton Down Syndrome Society. Owned the UI/UX from Figma to React Native, set up the team's CI, built the admin login.
location:
  lat: 53.55
  lon: -113.49
  label: Edmonton
dates: 'January 2026 - Present'
stats:
  - value: '65+'
    label: of 142 automated tests written
  - value: '18'
    label: user stories across 5 epics
stack:
  - React Native
  - FastAPI
  - Firebase
  - AWS
links: {} # TODO: github / demo URLs
# cover: TODO: e.g. ./edss-navigator/cover.webp (app screenshots)
# coverAlt: TODO
---
- Owned the app’s UI/UX end to end, from Figma wireframes to the React Native screens, including a redesigned Home screen with a collapsible category grid.
- Set up the team’s CI when we ran out of free GitHub Actions minutes: a self-hosted runner on a Cybera server, running every test on each pull request, with merges to main blocked until tests pass.
- Wrote 65+ of the team’s 142 automated tests, across pytest for the FastAPI backend and Jest with React Native Testing Library for the app.
- Designed most of the frontend for the app
- Built the admin login, including the Firebase Authentication setup, login API and login screen.
- Built a usage-analytics CSV export so EDSS staff can review how the app is used without technical tools.
- Fixed UI bugs across the app (refresh controls, header layout, resource card badges), working in sprints from a GitHub Kanban board.