#!/bin/sh
# CodeRabbit pre-push review (warn-only).
# Läuft via simple-git-hooks vor jedem `git push`. Reviewt die committeten
# Changes des aktuellen Branches gegen `main`, BEVOR sie den Rechner verlassen.
# Siehe CLAUDE.md → "Code review (CodeRabbit)".
#
# WARN-ONLY by design: Der Hook blockiert den Push NIE — er zeigt nur Findings.
# Gründe: (1) ein Rate-Limit/Netzwerkfehler soll dich nicht aussperren,
#         (2) Findings sind beratend, du entscheidest.
# Blockieren gewünscht? Siehe BLOCK-Variante am Ende dieser Datei.

export PATH="$HOME/.local/bin:$PATH"

BASE="main"

# CLI nicht installiert? Lautlos überspringen (kein Push-Blocker auf fremden Rechnern/CI).
if ! command -v coderabbit >/dev/null 2>&1; then
  echo "ℹ️  CodeRabbit CLI nicht gefunden — überspringe pre-push Review."
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"

# Auf main? Nichts gegen sich selbst zu reviewen.
if [ "$BRANCH" = "$BASE" ]; then
  echo "ℹ️  Auf $BASE — überspringe pre-push Review."
  exit 0
fi

# Keine neuen Commits ggü. base? Kein Review verschwenden (Free-Tier ~3/h).
AHEAD="$(git rev-list --count "$BASE..HEAD" 2>/dev/null || echo 0)"
if [ "$AHEAD" = "0" ]; then
  echo "ℹ️  Keine neuen Commits ggü. $BASE — überspringe pre-push Review."
  exit 0
fi

echo "🐰 CodeRabbit Review: $BRANCH ($AHEAD Commit(s)) vs $BASE … (Free-Tier ~3/h)"
echo "   Überspringen geht jederzeit mit:  git push --no-verify"
echo ""

# Warn-only: Output zeigen, aber Exit-Code des Reviews NICHT durchreichen.
coderabbit review --plain --type committed --base "$BASE" || true

echo ""
echo "🐰 Review gelesen — Push läuft weiter (Hinweise sind beratend)."
exit 0

# ──────────────────────────────────────────────────────────────────────────
# BLOCK-Variante (optional): Push abbrechen, wenn CodeRabbit Findings meldet.
# Ersetze den `coderabbit review ... || true`-Block oben durch:
#
#   if ! coderabbit review --plain --type committed --base "$BASE"; then
#     echo "❌ CodeRabbit hat Findings gemeldet — Push abgebrochen."
#     echo "   Beheben, oder bewusst überspringen mit: git push --no-verify"
#     exit 1
#   fi
#
# Achtung: blockt auch bei Rate-Limit/Netzwerkfehler. Nur nutzen, wenn du das willst.
