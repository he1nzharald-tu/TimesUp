// Einstieg: lädt Einstellungen und Karten und verbindet die HTML-Handler
import { state } from "./state.js";
import { initServiceWorker, restorePlayersAfterUpdate } from "./pwa.js";
import { initSavedGameBanner } from "./persist.js";
import { applyTheme, getDefaultRuleOptions, getSettings, loadSettingsFromStorage, loadThemeFromStorage, readJsonStore, renderRoundSettings, resetAllSettings, restoreSkipOptions, saveSettingsToStorage, toPositiveInt, toggleCustomRuleInput, toggleHandicapInput, togglePunishOptions, toggleSkipLimitValue, toggleSkipOptions, validateSettingsAndGoBack, writeJsonStore } from "./settings.js";
import { canStartCardSelection, ensureActiveArchive, ensureUniqueCardIds, formatArchiveDate, getActiveArchiveUsedCards, getAvailableCardPoolForArchive, getCardKey, handleCardSelectionClick, handleCardSelectionDone, handleCardVeto, hashCardText, isSameCard, loadArchiveEntry, loadCards, makeArchiveId, makeCard, openArchive, readArchiveStore, resetCardSelectionUi, savePlayedCardsToActiveArchive, shuffleArray, startCardSelection, startCardSelectionWithoutVeto, updateVetoDisplay, writeArchiveStore } from "./cards.js";
import { playEndAlarm, playTick, prepareAudioElement, stopTick, unlockGameAudio, unlockSingleAudio } from "./audio.js";
import { appAlert, appConfirm, appendText, displayTeams, refreshStartCardStatus, renderTeamPlayerList, setCardLoadStatusText, showAppDialog, showScreen, updateKartenStatusText, updatePlayerTable } from "./ui.js";
import { addPlayer, applyCurrentRoundPoints, assignRandomTeams, assignTeamsManually, buildTeamTurnOrder, cancelPenalty, confirmBeforeContinue, confirmStartRound, endRound, handleCorrect, handleMistake, handleSkip, markCurrentCardCorrectAfterTimer, nextGameRound, pauseGame, prepareGameOverview, removePlayer, resetGameState, resumeTimer, setActionButtonsEnabled, setNextPlayer, showCardCorrectionScreen, showFinalScreen, showGuessedCardsAfterTimer, showNextCard, showRoundStats, showStartRoundScreen, skippedCardsReturn, startGame, startRoundTimer, toggleExplanation, toggleHandicap, togglePlayerTeam, updateSkipButtonState } from "./game.js";

// Die HTML-Handler (onclick="..." usw.) erwarten die Funktionen global, wie vor der Aufteilung
const handlers = { addPlayer, appAlert, appConfirm, appendText, applyCurrentRoundPoints, applyTheme, assignRandomTeams, assignTeamsManually, buildTeamTurnOrder, canStartCardSelection, cancelPenalty, confirmBeforeContinue, confirmStartRound, displayTeams, endRound, ensureActiveArchive, ensureUniqueCardIds, formatArchiveDate, getActiveArchiveUsedCards, getAvailableCardPoolForArchive, getCardKey, getDefaultRuleOptions, getSettings, handleCardSelectionClick, handleCardSelectionDone, handleCardVeto, handleCorrect, handleMistake, handleSkip, hashCardText, isSameCard, loadArchiveEntry, loadCards, loadSettingsFromStorage, loadThemeFromStorage, makeArchiveId, makeCard, markCurrentCardCorrectAfterTimer, nextGameRound, openArchive, pauseGame, playEndAlarm, playTick, prepareAudioElement, prepareGameOverview, readArchiveStore, readJsonStore, refreshStartCardStatus, removePlayer, renderRoundSettings, renderTeamPlayerList, resetAllSettings, resetCardSelectionUi, resetGameState, restoreSkipOptions, resumeTimer, savePlayedCardsToActiveArchive, saveSettingsToStorage, setActionButtonsEnabled, setCardLoadStatusText, setNextPlayer, showAppDialog, showCardCorrectionScreen, showFinalScreen, showGuessedCardsAfterTimer, showNextCard, showRoundStats, showScreen, showStartRoundScreen, shuffleArray, skippedCardsReturn, startCardSelection, startCardSelectionWithoutVeto, startGame, startRoundTimer, stopTick, toPositiveInt, toggleCustomRuleInput, toggleExplanation, toggleHandicap, toggleHandicapInput, togglePlayerTeam, togglePunishOptions, toggleSkipLimitValue, toggleSkipOptions, unlockGameAudio, unlockSingleAudio, updateKartenStatusText, updatePlayerTable, updateSkipButtonState, updateVetoDisplay, validateSettingsAndGoBack, writeArchiveStore, writeJsonStore };
Object.assign(window, handlers);
// Zugriff für Fehlersuche und Tests: TimesUp.state, TimesUp.startGame() usw.
window.TimesUp = { state, ...handlers };

// === Initial Load ===
initServiceWorker();
renderRoundSettings();
loadSettingsFromStorage();
if (restorePlayersAfterUpdate()) updatePlayerTable();
initSavedGameBanner();
loadCards();
// run theme load after DOM ready-ish (this script is loaded at end of body in index.html)
loadThemeFromStorage();
// Button-Handler anpassen:
document.querySelectorAll('button[onclick*="showScreen(\'start\')"]').forEach(btn => {
    btn.addEventListener('click', resetGameState);
});
const loadSavesButton = document.getElementById("loadSavesButton");
if (loadSavesButton) {
    loadSavesButton.addEventListener("click", openArchive);
}