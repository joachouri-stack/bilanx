# 00 — Matrice de faisabilité par fonctionnalité

Légende : 🟢 IMM immédiatement réalisable · 🔵 API API/partenariat requis · 🟣 NAT application native requise ·
🟠 REG validation réglementaire requise · ⚪ REP à reporter. Une fonctionnalité peut cumuler plusieurs codes.

| Domaine | Fonctionnalité | Statut | Version | Commentaire |
|---|---|---|---|---|
| Comptes | Inscription, connexion, vérification e-mail | 🟢 | MVP | Auth maison ou fournisseur hébergé HDS-compatible |
| Comptes | MFA (TOTP + passkeys WebAuthn) | 🟢 | MVP | Obligatoire pour l'accès aux données de santé |
| Comptes | Historique des connexions, gestion des sessions | 🟢 | MVP | |
| Comptes | Export (JSON/CSV/PDF) et suppression RGPD | 🟢 | MVP | Art. 15, 17, 20 RGPD |
| Comptes | Connexion Pro Santé Connect (professionnels) | 🔵 | V3 | Raccordement ANS |
| Famille | Profils multiples, données séparées | 🟢 | MVP | Isolation par `profile_id` + RLS PostgreSQL |
| Famille | Aidant autorisé avec consentement tracé | 🟢 🟠 | MVP | Base légale à documenter (majeur protégé, mineur) |
| Famille | Professionnel invité (lecture limitée, expirante) | 🟢 | V2 | Lien d'accès temporaire + journalisation |
| Tableau de bord | Cartes personnalisables (ordre, visibilité) | 🟢 | MVP | Modules activés selon le profil |
| Glycémie | Import CSV LibreView | 🟢 | MVP | Format d'export à re-tester à chaque évolution |
| Glycémie | Graphiques 24 h / 7 / 14 / 30 / 90 j, navigation jour | 🟢 | MVP | |
| Glycémie | Statistiques (TIR/TBR/TAR, CV, GMI…) | 🟢 🟠 | MVP | Calculs descriptifs ; GMI clairement libellé « estimation » |
| Glycémie | Synchronisation automatique Abbott | 🔵 | V2+ | Uniquement via partenariat officiel Abbott |
| Glycémie | LibreLinkUp (API non officielle) | ❌ | — | **Exclu** : non autorisé, instable, risque contractuel |
| HbA1c | Saisie, historique, % ↔ mmol/mol | 🟢 | MVP | Formule IFCC/NGSP |
| Scanner | Import PDF/JPG/PNG/HEIC, multipage | 🟢 | MVP | HEIC converti côté serveur |
| Scanner | Capture caméra dans la PWA | 🟢 | MVP | `<input capture>` / getUserMedia ; recadrage simple |
| Scanner | OCR + extraction IA avec validation humaine | 🟢 🟠 | MVP | Fournisseur IA à contractualiser (HDS, sous-traitance) |
| Biologie | Bibliothèque de paramètres, historique, jauge capsule | 🟢 | MVP | Références = celles du laboratoire, par résultat |
| Biologie | Explications pédagogiques | 🟢 🟠 | MVP | Contenu relu par un médecin, non personnalisé |
| Insuline | Journal des injections, statistiques | 🟢 | MVP | Aucune suggestion de dose |
| Insuline | Calcul / recommandation de dose | ❌ 🟠 | — | **Exclu** : dispositif médical classe IIb au minimum |
| Insuline | Suivi des modifications prescrites | 🟢 | MVP | Saisie déclarative « prescrit par » |
| Journal | Repas, événements, photos, icônes sur chronologie | 🟢 | MVP | |
| Activité | Import manuel / fichier export Apple Santé (XML) | 🟢 | V2 | Export.zip lourd ; parsing serveur |
| Activité | Synchronisation Apple Watch via HealthKit | 🟣 | V2 | App iOS compagnon obligatoire |
| Activité | Android Health Connect | 🟣 | V2/V3 | App Android compagnon |
| Médicaments | Saisie, horaires, historique de prise | 🟢 | MVP (saisie) / V2 (rappels) | |
| Médicaments | Extraction depuis ordonnance | 🟢 🟠 | V2 | Confirmation obligatoire avant activation |
| Médicaments | Rappels push fiables | 🟢 🟣 | V2 | Web Push iOS ≥ 16.4 si PWA installée ; natif plus fiable |
| Médicaments | Base médicamenteuse officielle (BDPM) | 🟢 | V2 | Données publiques ANSM / base-donnees-publique.medicaments.gouv.fr |
| Rendez-vous | Calendrier, rappels, notes, documents liés | 🟢 | MVP (simple) / V2 | Export iCal |
| Rapports | Export PDF période, sources, données manquantes | 🟢 | MVP | Rendu serveur |
| Rapports | Partage contrôlé avec un professionnel | 🟢 | V2 | Lien expirant, code, journalisation |
| Rapports | Messagerie sécurisée de santé (MSSanté) | 🔵 | V3 | Raccordement ANS |
| Assistant IA | Questions sur ses propres données (RAG, citations) | 🟢 🟠 | V2 | Bêta encadrée, analyse MDR avant ouverture |
| Assistant IA | Résumé hebdomadaire descriptif | 🟢 🟠 | V2 | |
| Assistant IA | Diagnostic, prescription, ajustement de dose | ❌ | — | **Exclu** par conception |
| Interop | Mon Espace Santé / DMP | 🔵 🟠 | V3 | Référencement ANS (Ségur) |
| Interop | Connexion laboratoires (HPRIM/FHIR) | 🔵 | V3 | Partenariats laboratoires |
| Plateforme | PWA installable, responsive | 🟢 | MVP | |
| Plateforme | Multilingue (i18n) | 🟢 | Préparé MVP, traduit V3 | Clés i18n dès le départ |
