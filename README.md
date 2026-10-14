# Neon 2048

Un jeu de billes inspiré de 2048, construit avec Node.js et Matter.js. Les billes tombent dans une arène circulaire, rebondissent et fusionnent lorsqu’elles entrent en collision avec une bille de même valeur. L’application comprend également des effets visuels, des sons, une pause et des statistiques.

## Technologies

- Node.js (modules ES)
- [Matter.js 0.19.0](https://brm.io/matter-js/), chargé depuis un CDN dans la page
- API Node.js pour servir l’application

## Structure du projet

- `index.js` — page du jeu et serveur local d’aperçu
- `api/index.js` — fonction API utilisée par Vercel
- `vercel.json` — réécriture de la page d’accueil vers l’API
- `package.json` — configuration des modules ES

## Déploiement sur Vercel

1. Enregistre tous les fichiers du projet dans un dépôt GitHub.
2. Dans Vercel, importe ce dépôt comme nouveau projet.
3. Choisis **Other** comme préréglage (*Framework Preset*) et conserve les réglages de déploiement par défaut.
4. Déploie le projet. Les déploiements suivants pourront être déclenchés par les nouveaux commits sur GitHub.

> Matter.js est chargé depuis un CDN : le navigateur doit avoir accès à cette ressource pour afficher la simulation.
