export const howToPlaySections = [
  {
    title: "General",
    items: [
      "You start with 50,000 coins in-game balance.",
      "This game is meant for fun among friends only. No real money is involved.",
      "Use your balance carefully because extra balance is not credited automatically.",
    ],
  },
  {
    title: "Betting Rules",
    items: [
      "You can place bets only while betting is open for a match.",
      "Betting opens 24 hours before the match starts.",
      "Once the match reaches lock time, new bets and edits stop immediately.",
      "Your bet amount is deducted from your balance as soon as the prediction is placed.",
      "You can see other users' bets on a match page.",
      "You can update your bet before lock if editing is still allowed for that fixture.",
    ],
  },
  {
    title: "Results & Rewards",
    items: [
      "If your selected team wins, you receive a payout based on the bet amount.",
      "If a match has no result, the bet amount is refunded.",
      "If your prediction loses, the deducted amount stays lost.",
      "Scoring per settled match: Win +3 points, Loss +0 points.",
      "If your participation is at least 35% and you skip a settled match, you get -1 point.",
      "If your participation is below 35%, skipped settled matches have no point penalty.",
      "Settled results update points, wins, and losses on your profile and leaderboard.",
    ],
  },
  {
    title: "Leaderboard",
    items: [
      "Only users with at least 35% participation in completed matches are listed on the leaderboard.",
      "For listed users: Win +3, Loss +0, Did not play -1 (per settled match).",
      "For users below 35% participation: no -1 inactivity penalty.",
      "Players are ranked by points first.",
      "If points are equal, the player with more wins ranks higher.",
      "If points and wins are equal, the player with fewer losses ranks higher.",
      "Your pocket balance is shown on the leaderboard for easy tracking.",
    ],
  },
  {
    title: "Tracking",
    items: [
      "Your active and settled bets are visible on the My Bets screen.",
      "Wallet credits and debits are visible on the Transactions screen.",
      "Leaderboard ranking is based on app points, wins, and losses.",
      "Fixtures, match status, and public bets are visible from the main app screens.",
    ],
  },
] as const;
