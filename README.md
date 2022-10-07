# Homebridge Linky Energy Meter

Ceci est un plugin pour homebridge (Eve app exclusivement)

j'utilise fakegato plugin ([simont77/fakegato-history](https://github.com/simont77/fakegato-history)).
Ainsi que linky plugin ([bokub/linky](https://github.com/bokub/linky)) 



# Installation Instructions

Configuration du plugin :

        {
           "name": ce que vous voulez,
            "firstDateRecord": date du premier enregistrement par enedis (si ca dépasse 1 an le plugin prendra la date du jours moin 1 an),
            "refreshToken": suivre les instruction sur (https://github.com/bokub/linky) pour créer des tokens,
            "usagePointId": numéro du compteur linky,
            "accessToken":  suivre les instruction sur (https://github.com/bokub/linky) pour créer des tokens,
            "accessory": "EnergyMeter"        
        }


 