# Politique de confidentialité — MyFinance

*Dernière mise à jour : 20 septembre 2026*

MyFinance est une application personnelle et non commerciale de suivi de finances
domestiques, auto-hébergée et utilisée par les seuls membres du foyer qui
l'exploitent. Elle n'est proposée à aucun autre public, ne comporte ni publicité
ni traceur, et ne monétise aucune donnée.

## Qui est responsable du traitement

L'application est déployée et administrée par son propriétaire, sur son propre
projet Google Cloud. C'est lui le responsable du traitement au sens du RGPD, et
il est également l'une des personnes concernées. Contact :
[github.com/alemat13](https://github.com/alemat13).

## Quelles données sont traitées

- **Données saisies dans l'application** : comptes, catégories, transactions,
  utilisateurs du foyer et règles de répartition des dépenses.
- **Données bancaires récupérées via Enable Banking** : pour les seuls comptes
  que l'utilisateur rattache explicitement, l'application lit le libellé, la
  date, le montant, la devise et la référence de chaque transaction, ainsi que
  l'IBAN et l'intitulé du compte.

L'application **ne voit jamais les identifiants bancaires**. L'authentification
se déroule entièrement sur le site de la banque ; MyFinance ne reçoit qu'une
autorisation d'accès en lecture, limitée dans le temps et révocable.

## À quoi elles servent

Uniquement à afficher, catégoriser et répartir les dépenses du foyer dans
l'application. Aucun autre usage : pas de profilage, pas de décision
automatisée, pas d'analyse comportementale.

## Avec qui elles sont partagées

Avec personne. Les données ne sont ni vendues, ni louées, ni transmises à des
tiers. Trois prestataires techniques interviennent, et uniquement à ce titre :

- **Enable Banking**, prestataire agréé d'agrégation de comptes (DSP2), qui
  transmet les données bancaires à l'application.
- **Google Cloud**, qui héberge l'application et sa base de données.
- **Microsoft OneDrive**, si la sauvegarde automatique est activée, pour stocker
  une archive chiffrée de la base dans l'espace personnel du propriétaire.

## Où elles sont stockées, et combien de temps

Dans une base Cloud SQL (PostgreSQL) du projet Google Cloud du propriétaire.
L'accès à l'application est restreint par Google Cloud IAP : seules les
personnes explicitement autorisées peuvent l'ouvrir. Les jetons d'accès aux
services tiers sont chiffrés au repos.

Les données sont conservées tant que l'utilisateur les conserve. Il peut
supprimer une transaction, un compte ou l'intégralité de la base à tout moment
depuis l'application.

## Consentement bancaire

Le consentement donné à la banque est limité à une durée fixée par celle-ci
(environ 90 jours en France) et à la consultation des comptes sélectionnés. Il
peut être révoqué à tout moment, depuis l'écran « Bank Sync » de l'application
ou directement auprès de la banque. Une révocation arrête immédiatement toute
nouvelle récupération de données.

## Droits des personnes concernées

Accès, rectification, effacement, limitation, opposition et portabilité
s'exercent directement dans l'application, qui permet de consulter, modifier,
exporter et supprimer l'intégralité des données. Toute demande complémentaire
peut être adressée via le contact ci-dessus.

## Modifications

Toute évolution de cette politique est publiée dans ce dépôt, dont l'historique
Git fait foi.
