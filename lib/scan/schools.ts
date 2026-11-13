import { normInterest } from "@/lib/social/follow-rank";

/**
 * College programs a Bowman U, Bowman Chrome U or draft-picks card prints where a pro card
 * prints its team. Names only: no logos. A school line is the card's team line, and it marks
 * the card as a college product. It never names the sport on its own (the position line does).
 */
const SCHOOLS = [
  "Alabama", "Arizona", "Arizona State", "Arkansas", "Auburn", "Baylor", "Boise State", "Boston College", "BYU",
  "California", "Cincinnati", "Clemson", "Colorado", "Connecticut", "UConn", "Creighton", "Duke", "Florida",
  "Florida State", "Georgia", "Georgia Tech", "Gonzaga", "Houston", "Illinois", "Indiana", "Iowa", "Iowa State",
  "Kansas", "Kansas State", "Kentucky", "Louisville", "LSU", "Marquette", "Maryland", "Memphis", "Miami",
  "Michigan", "Michigan State", "Minnesota", "Mississippi State", "Missouri", "Nebraska", "North Carolina",
  "NC State", "Northwestern", "Notre Dame", "Ohio State", "Oklahoma", "Oklahoma State", "Ole Miss", "Oregon",
  "Oregon State", "Penn State", "Pittsburgh", "Purdue", "Rutgers", "SMU", "South Carolina", "Stanford", "Syracuse",
  "TCU", "Tennessee", "Texas", "Texas A&M", "Texas Tech", "Tulane", "UCF", "UCLA", "USC", "Utah", "Vanderbilt",
  "Villanova", "Virginia", "Virginia Tech", "Wake Forest", "Washington", "Washington State", "West Virginia",
  "Wisconsin", "Army", "Navy", "Air Force", "Appalachian State", "Coastal Carolina", "Fresno State", "James Madison",
  "Liberty", "Marshall", "San Diego State", "South Florida", "Toledo", "Tulsa", "UNLV", "UTSA", "Western Kentucky",
  "Wyoming", "Jackson State", "North Dakota State", "South Dakota State", "Montana", "Montana State",
] as const;

const BY_KEY = new Map<string, string>(SCHOOLS.map((name) => [normInterest(name), name]));

/**
 * The school a line names, or "". The line is the school and nothing else, or the school and
 * one more word (its nickname: "UCLA BRUINS"). A city a pro team shares ("HOUSTON TEXANS",
 * "MIAMI HEAT") is the caller's to rule out: it checks the pro teams first.
 */
export function schoolOnLine(line: string): string {
  const words = normInterest(line).split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return "";
  const whole = BY_KEY.get(words.join(" "));
  if (whole) return whole;
  return words.length >= 2 ? (BY_KEY.get(words.slice(0, -1).join(" ")) ?? "") : "";
}
