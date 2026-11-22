// Gemeinsamer Spielzustand und Speicher-Schlüssel
export const ARCHIVE_STORAGE_KEY = "timesup_archive";
export const SETTINGS_STORAGE_KEY = "timesup_settings";

// Standard-Zeit pro Zug in Sekunden (frische Installation, Standardwerte, Fallback im Spiel)
export const DEFAULT_TURN_SECONDS = 30;

// Alle Werte, die mehrere Module lesen und ändern
export const state = {

    // === Game State ===
    cardPool: [], // Array of {id, begriff, erklaerung}
    vetoCountPerPlayer: 0,
    remainingVetos: 0,
    cardsWereShown: false,
    allowCardClick: false,
    playingCards: [],
    showingExplanation: false,
    currentRound: 0,
    totalRounds: 1,
    players: [],
    teams: [], // Array of team arrays instead of teamA/teamB
    currentCardPlayerIndex: 0,
    shuffledCardPool: [],
    playerCardCount: 0,
    cardSelectionTargetCount: 0,
    totalTeams: 2, // Default to 2 teams, can be changed in settings
    activeTeamIndex: 0, // Index of current team (0, 1, 2, etc.)
    activePlayerIndexInTeam: -1, // Player index within current team
    teamTurnOrder: [],
    teamTurnOrderPosition: -1,
    activePlayerIndicesByTeam: [],
    activeArchiveId: null,
    cardLoadStatusText: "Karten werden geladen...",

    // === Game Logic ===
    timer: undefined,
    remainingTime: 0,
    isTimerRunning: false, // guard to prevent duplicate intervals
    displayedCards: [], // IDs der in diesem Zug schon gezeigten Karten
    skippedThisTurn: [], // übersprungene Karten, die im selben Zug zurückkommen dürfen
    skipCounter: 0,
    isPenaltyActive: false,
    penaltyTimeout: null,
    penaltyInterruptedByPause: false,
    totalPoints: [], // Array of points per team [team0_points, team1_points, ...]
    currentCards: [],
    currentCard: null,
    correctCards: [], // Array of arrays: [team0_cards, team1_cards, ...]
    roundPointsApplied: false,
    usedCardsThisTurn: [],
    teamMistakes: [], // Array of mistakes per team
    penaltyPoints: [], // insgesamt abgezogene Strafpunkte je Team
    activePlayer: null,
};
