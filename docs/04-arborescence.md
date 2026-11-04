# 04 — Arborescence des pages

Toutes les pages « santé » sont préfixées par le profil actif : `/p/[profileId]/…`. Le sélecteur de profil
est toujours visible en haut (avatar + nom), ce qui évite toute confusion entre les données de deux personnes.

```
bilanx.fr
├── /                                   Page publique (présentation, sécurité, tarifs, FAQ)
├── /securite  /confidentialite  /cgu  /mentions-legales  /cookies
├── /connexion  /inscription  /mot-de-passe-oublie  /verifier-email
├── /mfa                                Configuration et vérification MFA
├── /bienvenue                          Onboarding : profil, modules à suivre, consentements
│
├── /p/[profileId]/
│   ├── tableau-de-bord                 Cartes personnalisables
│   │   └── ?edition=1                  Mode personnalisation (ordre, visibilité)
│   ├── glycemie                        Vue jour (flèches, calendrier, « Aujourd'hui »)
│   │   ├── ?vue=7j|14j|30j|90j|perso   Vues période + profil AGP
│   │   ├── /statistiques
│   │   ├── /importer                   Import CSV LibreView (assistant pas à pas)
│   │   ├── /sources                    État des sources, dernière synchro
│   │   └── /plages-cibles
│   ├── analyses
│   │   ├── /                           Grille de jauges par catégorie
│   │   ├── /[analyte]                  Historique, graphique, documents, explication
│   │   ├── /hba1c                      Module HbA1c dédié (labo vs estimation capteur)
│   │   └── /ajouter                    Saisie manuelle
│   ├── traitements
│   │   ├── /insuline                   Journal des injections + statistiques
│   │   ├── /insuline/evolution         Historique des modifications prescrites
│   │   ├── /medicaments                Liste, détail, prises
│   │   └── /medicaments/[id]
│   ├── activite                        Jour (par heure) / semaine / mois / année
│   ├── journal                         Chronologie de la journée (repas + événements)
│   │   └── /nouveau
│   ├── vue-combinee                    Glycémie + insuline + repas + activité + événements
│   ├── documents
│   │   ├── /                           Bibliothèque (filtres type/date/source)
│   │   ├── /scanner                    Capture caméra / import fichiers
│   │   ├── /[documentId]               Visionneuse + valeurs liées
│   │   └── /[documentId]/validation    Validation des valeurs extraites par l'IA
│   ├── rendez-vous
│   │   └── /[id]
│   ├── rapports                        Génération PDF + historique + liens de partage
│   └── assistant                       Assistant IA (V2, bêta)
│
├── /famille                            Profils gérés, invitations, aidants, révocations
│   └── /[profileId]/acces              Qui a accès à quoi + journal d'accès
├── /parametres
│   ├── /compte                         E-mail, mot de passe, passkeys, MFA
│   ├── /securite                       Sessions actives, historique des connexions
│   ├── /preferences                    Unités, langue, thème
│   ├── /notifications
│   ├── /consentements                  Consentements donnés / retirés
│   └── /mes-donnees                    Export, suppression du compte
└── /partage/[token]                    Accès professionnel invité (lien + code, expirant)
```

## Navigation

**Desktop** : barre latérale à gauche (12 entrées du cahier des charges, regroupées) :

1. Tableau de bord · 2. Glycémie · 3. Analyses & Bilans · 4. Insuline & Traitements · 5. Activité & Pas ·
6. Journal & Repas · 7. Documents & Scanner · 8. Rendez-vous · 9. Rapports PDF · 10. Assistant IA ·
— séparateur — · 11. Famille & Profils · 12. Paramètres

Les entrées de modules désactivés pour le profil sont masquées (ex. Glycémie / Insuline pour un non-diabétique).

**Mobile** : barre inférieure à 5 emplacements :

| Accueil | Données ▾ | **＋ (action rapide)** | Documents | Profil |
|---|---|---|---|---|

Le bouton central « ＋ » ouvre une feuille : *Scanner un document · Noter un repas · Noter une injection ·
Ajouter un événement · Ajouter un résultat*. « Données » ouvre la liste des modules actifs.
