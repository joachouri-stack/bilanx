# 10 — Estimation des coûts de développement et d'exploitation

> Ordres de grandeur en euros HT, marché français 2026, à affiner par devis. Les fourchettes reflètent l'écart entre
> une équipe interne/freelance et une agence.

## 10.1 Développement

| Poste | MVP (≈ 6 mois) | V2 (≈ 6 mois) | V3 (≈ 12 mois) |
|---|---|---|---|
| Développement web/back (2 ETP) | 120 – 190 k€ | 110 – 170 k€ | 220 – 340 k€ |
| IA / OCR / data (0,5 ETP) | 30 – 50 k€ | 30 – 50 k€ | 60 – 100 k€ |
| Design UX/UI (0,5 ETP) | 25 – 45 k€ | 20 – 35 k€ | 30 – 50 k€ |
| iOS natif (1 ETP) | — | 55 – 90 k€ | 60 – 100 k€ |
| Android natif | — | (0 – 60 k€ selon décision) | 60 – 100 k€ |
| Chef de produit / QA | 30 – 50 k€ | 30 – 50 k€ | 60 – 100 k€ |
| **Sous-total développement** | **≈ 205 – 335 k€** | **≈ 245 – 455 k€** | **≈ 490 – 790 k€** |

## 10.2 Conformité, sécurité, juridique

| Poste | Coût |
|---|---|
| DPO externalisé | 6 – 15 k€/an |
| AIPD + registre + documentation RGPD (accompagnement) | 8 – 20 k€ (initial) |
| Avocat santé/numérique : CGU, politique de confidentialité, contrats | 10 – 25 k€ (initial) |
| Expert affaires réglementaires MDR : qualification, destination d'usage | 8 – 20 k€ (initial) |
| Si qualification DM classe IIa un jour : QMS ISO 13485, dossier technique, organisme notifié | 150 – 400 k€ et 12 – 24 mois (hors périmètre prévu) |
| Test d'intrusion | 8 – 20 k€ par campagne |
| Médecin conseil (relecture contenus pédagogiques, garde-fous IA) | 5 – 15 k€/an |
| Assurance RC professionnelle + cyber | 3 – 10 k€/an |

## 10.3 Exploitation mensuelle

| Poste | 1 000 utilisateurs actifs | 10 000 | 100 000 |
|---|---|---|---|
| Hébergement HDS (calcul, PostgreSQL managé HA, stockage objet, sauvegardes, environnement staging) | 800 – 2 000 € | 2 000 – 5 000 € | 8 000 – 20 000 € |
| OCR + IA d'extraction (≈ 2 docs/utilisateur/mois, ≈ 0,02 – 0,10 € par document selon modèle et pages) | 40 – 200 € | 400 – 2 000 € | 4 000 – 20 000 € |
| Assistant IA (V2, usage modéré) | — | 500 – 3 000 € | 5 000 – 30 000 € |
| E-mails, SMS (MFA de secours), push | 30 – 100 € | 100 – 500 € | 1 000 – 4 000 € |
| Observabilité, SIEM, sauvegarde externe | 200 – 500 € | 500 – 1 500 € | 2 000 – 5 000 € |
| Comptes développeur Apple / Google | ≈ 10 € | ≈ 10 € | ≈ 10 € |
| Support utilisateur | 0,2 ETP | 1 ETP | 4 – 6 ETP |
| **Total technique (hors salaires support)** | **≈ 1 – 3 k€** | **≈ 3,5 – 12 k€** | **≈ 20 – 80 k€** |

Remarque : un hébergement HDS a un **coût plancher** (HA, sauvegardes, environnements, prestations d'infogérance
certifiée le cas échéant) indépendant du nombre d'utilisateurs. Ne pas sacrifier la qualité de l'hébergeur au prix.

## 10.4 Points d'équilibre indicatifs

Avec un panier moyen ≈ 6 €/mois et 15 % d'utilisateurs payants, 10 000 utilisateurs actifs génèrent ≈ 9 k€/mois :
suffisant pour couvrir l'exploitation technique, pas l'équipe. Le financement initial (≈ 300 – 450 k€ pour atteindre
un MVP conforme et 6 mois de bêta) doit être prévu (fonds propres, BPI / i-Nov / French Tech, love money, business angels santé).
