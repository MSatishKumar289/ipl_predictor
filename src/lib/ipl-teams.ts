export type IplTeamId =
  | "csk"
  | "dc"
  | "gt"
  | "pbks"
  | "kkr"
  | "lsg"
  | "mi"
  | "rcb"
  | "rr"
  | "srh";

export type IplTeam = {
  id: IplTeamId;
  name: string;
  shortCode: string;
  logo: number;
};

export const IPL_TEAMS: IplTeam[] = [
  {
    id: "csk",
    name: "Chennai Super Kings",
    shortCode: "CSK",
    logo: require("../../assets/images/ipl_Logos/CSK_Logo.png"),
  },
  {
    id: "dc",
    name: "Delhi Capitals",
    shortCode: "DC",
    logo: require("../../assets/images/ipl_Logos/DC_logo.jpg"),
  },
  {
    id: "gt",
    name: "Gujarat Titans",
    shortCode: "GT",
    logo: require("../../assets/images/ipl_Logos/GT_Logo.png"),
  },
  {
    id: "pbks",
    name: "Punjab Kings",
    shortCode: "PBKS",
    logo: require("../../assets/images/ipl_Logos/K11P_Logo.png"),
  },
  {
    id: "kkr",
    name: "Kolkata Knight Riders",
    shortCode: "KKR",
    logo: require("../../assets/images/ipl_Logos/KKR_Logo.png"),
  },
  {
    id: "lsg",
    name: "Lucknow Super Giants",
    shortCode: "LSG",
    logo: require("../../assets/images/ipl_Logos/LSG_Logo.png"),
  },
  {
    id: "mi",
    name: "Mumbai Indians",
    shortCode: "MI",
    logo: require("../../assets/images/ipl_Logos/MI_Logo.png"),
  },
  {
    id: "rcb",
    name: "Royal Challengers Bengaluru",
    shortCode: "RCB",
    logo: require("../../assets/images/ipl_Logos/RCB_Logo.png"),
  },
  {
    id: "rr",
    name: "Rajasthan Royals",
    shortCode: "RR",
    logo: require("../../assets/images/ipl_Logos/RR_Logo.png"),
  },
  {
    id: "srh",
    name: "Sunrisers Hyderabad",
    shortCode: "SRH",
    logo: require("../../assets/images/ipl_Logos/SRH_Logo.png"),
  },
];

export function getIplTeamById(teamId: IplTeamId | null) {
  return IPL_TEAMS.find((team) => team.id === teamId) ?? null;
}
