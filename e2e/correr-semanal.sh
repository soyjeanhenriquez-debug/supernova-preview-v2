#!/bin/zsh -l
# Agente probador del Guardián del Creador (lo llama launchd los lunes a las 9:00, hora de la Mac).
# Corre contra la app publicada con tu sesión guardada (npm run e2e:sesion) y anota todo en el Guardián.
cd "$(dirname "$0")/.." || exit 1
LOG="$HOME/.supernova-e2e/log.txt"
echo "=== $(date '+%d-%m-%Y %H:%M') ===" >> "$LOG"
if [ ! -f "$HOME/.supernova-e2e/sesion.json" ]; then
  echo "Sin sesión guardada: corre «npm run e2e:sesion» una vez." >> "$LOG"
  exit 0
fi
npx playwright test --project=escritorio --project=celular >> "$LOG" 2>&1
echo "salida: $?" >> "$LOG"
