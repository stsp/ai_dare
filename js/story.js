/* An alternative story, chosen on the options page: instead of a pilot on
 * the alien boss's asteroid, a policeman riding the mail rocket to Mars. A
 * skeleton cuts the rocket off over his cosmodrome and makes it land; the
 * boxes are scattered through the sectors, and the policeman has to gather
 * them, load them and send the rocket on. Only the words change: every
 * message, the panel and the title. The original's lines stay the default.
 * The font gains the Cyrillic letters it needs, in the same four-by-six
 * cells. */

Object.assign(GLYPHS, {
  "А": "699f99", "Б": "f8e99e", "В": "e9e99e", "Г": "f88888", "Д": "6555f9", "Е": "f8e88f", "Ё": "f8e88f",
  "Ж": "9f6f99", "З": "e1611e", "И": "99bd99", "Й": "49bd99", "К": "9acca9", "Л": "75555d", "М": "9ff999",
  "Н": "99f999", "О": "699996", "П": "f99999", "Р": "e9e888", "С": "788887", "Т": "f44444", "У": "997116",
  "Ф": "4eae44", "Х": "996699", "Ц": "9999f1", "Ч": "999711", "Ш": "bbbbbf", "Щ": "bbbbf1", "Ъ": "c46556",
  "Ы": "99dbbd", "Ь": "88e99e", "Э": "e1711e", "Ю": "abfbba", "Я": "799759",
});

// the original's lines, joined by |, and what the policeman's story says instead
const STORY = {
  "AI DARE": ["АИ ДАРЕ"],                       // the game's name; the hero himself is Мент Даре
  "COP'S ADVENTURE": ["ПРИКЛЮЧЕНИЯ МЕНТА"],
  "PRESS 'FIRE' TO PLAY": ["ЖМИ 'ОГОНЬ' ЧТОБЫ ИГРАТЬ"],
  "OR '1' FOR OPTIONS": ["ИЛИ '1' ДЛЯ НАСТРОЕК"],
  "BEST  SCORES": ["ЛУЧШИЕ  СЧЕТА"],
  "AI DARE SPEEDS|OVER THE ASTEROID!": ["РАКЕТА С ПОЧТОВЫМ ГРУЗОМ", "НА МАРС ПЕРЕХВАЧЕНА!"],
  "THE SHIP STAYS BEHIND|TO AWAIT AI'S RETURN": ["РАКЕТА ЖДЁТ НА СТАРТЕ", "МЕНТА С ЯЩИКАМИ"],
  "\"YOU WILL NOT SUCCEED, DARE!\"": ["\"САДИСЬ НА КОСМОДРОМ, МЕНТ!",
                                     "НА МАРС ТЕБЕ СЕГОДНЯ НЕ ЛЕТЕТЬ.",
                                     "МОИ ЭНЕРГЕТИЧЕСКИЕ ПОЛЯ",
                                     "СОПРОВОДЯТ ТЕБЯ НА ПОСАДКУ\""],
  "AI LANDS ON|THE ASTEROID": ["МЕНТ САДИТСЯ НА ЧУЖОЙ", "КОСМОДРОМ"],
  "INTRUDER ALERT !": ["ЧУЖОЙ НА КОСМОДРОМЕ !"],
  "AI IS NOW IN SECTOR #": ["МЕНТ ТЕПЕРЬ В СЕКТОРЕ #"],
  "\"I SAY....IT'S A HOLOGRAM !\"": ["\"ОПА... ДА ЭТО ГОЛОГРАММА !\""],
  "\"NO! PUT THAT DOWN!\"": ["\"МЕНТ! НЕ ТРОЖЬ ЯЩИК!\""],
  "THE SELF DESTRUCT ROOM": ["ГРУЗОВОЙ ОТСЕК РАКЕТЫ"],
  "AI CAN CRUSH FLOOR GUNS": ["МЕНТ ДАВИТ НАПОЛЬНЫЕ ПУШКИ"],
  "WALK TO THE LEFT|TO FIT THE PART": ["ИДИ ВЛЕВО,", "ЧТОБЫ ЗАГРУЗИТЬ ЯЩИК"],
  "NOW TAKE IT TO THE|SELF-DESTRUCT SYSTEM": ["ТЕПЕРЬ НЕСИ ЕГО", "В ГРУЗОВОЙ ОТСЕК"],
  "PART # FITTED": ["ЯЩИК # ЗАГРУЖЕН"],
  "A DOOR OPENS TO|THE NEXT SECTOR": ["ОТКРЫЛСЯ ПРОХОД", "В СЛЕДУЮЩИЙ СЕКТОР"],
  "THE SURVEY ENDS HERE|FOR NOW": ["ДАЛЬШЕ ПОКА", "НЕ РАЗВЕДАНО"],
  "\"11 MINUTES TO SELF DESTRUCT\"": ["\"11 МИНУТ ДО СТАРТА, МЕНТ\""],
  "OUT OF ORDER": ["НЕ РАБОТАЕТ"],
  "THIS ROOM IS SAFE": ["ТУТ ЧИСТО"],
  "AI FELL TOO FAR!": ["МЕНТ РАСШИБСЯ!"],
  "AI FALLS UNCONSCIOUS|FOR TEN MINUTES": ["МЕНТ ОТКЛЮЧИЛСЯ", "НА ДЕСЯТЬ МИНУТ"],
  "ENERGY RESTORED": ["СИЛЫ ВОССТАНОВЛЕНЫ"],
  "YOU WILL NOT|SUCCEED, DARE!": ["НЕ ДОНЕСЁШЬ ТЫ", "ЭТИ ЯЩИКИ, МЕНТ!"],
  "THE ASTEROID CANNOT|BE STOPPED, DARE": ["ПОЧТА НИКУДА", "НЕ УЛЕТИТ, МЕНТ"],
  "MY GUARDS WILL|FIND YOU, DARE": ["МОИ ПАЦАНЫ", "ТЕБЯ НАЙДУТ, МЕНТ"],
  "TIME IS RUNNING|OUT, EARTHMAN": ["ВРЕМЯ ВЫХОДИТ,", "ЛЕГАВЫЙ"],
  "GIVE UP, DARE.|EARTH IS FINISHED": ["БРОСЬ ЯЩИКИ, МЕНТ.", "МАРС ПОДОЖДЁТ"],
  "AI DARE MAKES A GETAWAY!": ["РАКЕТА УХОДИТ НА МАРС!"],
  "FIVE": ["ПЯТЬ"], "FOUR": ["ЧЕТЫРЕ"], "THREE": ["ТРИ"], "TWO": ["ДВА"], "ONE": ["ОДИН"],
  "WELL DONE SIR! THIS COULD|GET YOU YOUR KNIGHTHOOD!": ["МЕНТ ДАРЕ ОБЪЯВЛЕН В РОЗЫСК", "ПО ВСЕЙ СОЛНЕЧНОЙ СИСТЕМЕ"],
  "OUT OF TIME": ["ВРЕМЯ ВЫШЛО"],
  "THE ASTEROID HITS EARTH": ["ПОЧТА ТАК И НЕ УЛЕТЕЛА"],
  "GAME|OVER": ["ИГРА", "ВСЁ"],
  "SCORE #": ["СЧЁТ #"],
  "PARTS # OF 5": ["ЯЩИКИ # ИЗ 5"],
  "CONTROL  OPTIONS": ["НАСТРОЙКИ"],
  "KEYBOARD Q,A,O,P,SPACE": ["КЛАВИШИ Q,A,O,P,ПРОБЕЛ"],
  "CURSOR KEYS AND SPACE": ["СТРЕЛКИ И ПРОБЕЛ"],
  "STORY: AI DARE": ["СЮЖЕТ: МЕНТ ДАРЕ"],
  "THE ASTEROID IS COMING.": ["ПОЧТА НЕ ДОШЛА ДО МАРСА."],
  "AI DARE GOES IN ALONE.": ["МЕНТ ДАРЕ ИДЁТ ОДИН."],
  "PRESS 'ENTER' WHEN DONE.": ["ГОТОВО - ЖМИ 'ENTER'."],
  "PRESS SPACE": ["НАЖМИ ПРОБЕЛ"],
};

/* The postal story's ending: instead of the countdown, the skeleton comes on
 * the link and says what was really in the boxes, a page at a time, and then
 * Mars goes up. His words are Stas's own. */
const SKELETON_CALL = [
  [["ОТЛИЧНО, МЕНТ!", "В ЯЩИКАХ БЫЛА ВЗРЫВЧАТКА."], 3.0],
  [["МАРСУ ТЕПЕРЬ КОНЕЦ.", "КАК, ВПРОЧЕМ, И ТЕБЕ:", "ВЕДЬ ЭТО ТЫ ЕГО ВЗОРВАЛ!"], 3.8],
  [["ХАХАХА"], 1.6],
];

/** The lines to show: the original's, or the story's version of them when
 *  that is chosen; # stands for a number. */
function tx(lines, n) {
  let out = lines;
  if (state.story === "postal") out = STORY[lines.join("|")] || lines;
  return n === undefined ? out : out.map((l) => l.replace("#", n));
}

// ----------------------------------------------------------- options page
// As the original's: the control options, one of them lit, and "PRESS
// 'ENTER' WHEN DONE." - plus the story, which the original never offered.
const options = { control: 1 };

function loadStory() {
  try { return localStorage.getItem("aidare.story") === "postal" ? "postal" : "dare"; } catch (e) { return "dare"; }
}
function setStory(s) {
  state.story = s;
  try { localStorage.setItem("aidare.story", s); } catch (e) { /* no storage */ }
}

function updateOptions() {
  if (tapped.Digit1) options.control = 1;
  if (tapped.Digit2) options.control = 2;
  if (tapped.Digit3) setStory(state.story === "postal" ? "dare" : "postal");
  if (tapped.Enter || tapped.Escape) { state.mode = "title"; menu.t = 0; }
}

function drawOptions(ctx) {
  drawFrame(ctx);
  ctx.save();
  ctx.translate(VIEW_X, VIEW_Y);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTitleBox(ctx);
  const tick = Math.floor(state.phase * 10);
  const head = tx(["CONTROL  OPTIONS"])[0];
  drawBig(ctx, head, 120 - textWidth(head) * 0.8, 62, C.white, 1.6);
  const lines = [tx(["KEYBOARD Q,A,O,P,SPACE"])[0], tx(["CURSOR KEYS AND SPACE"])[0], tx(["STORY: AI DARE"])[0]];
  lines.forEach((ln, i) => {
    const y = 82 + i * 13, lit = i + 1 === options.control || (i === 2 && state.story === "postal");
    if (lit) { ctx.fillStyle = C.black; ctx.fillRect(2, y - 2, VIEW_W - 4, 11); }
    const col = lit ? CYCLE[(tick + i) % CYCLE.length] : C.white;
    drawBig(ctx, String(i + 1), 12, y, col, 1.6);
    drawBig(ctx, ln, 40, y, col, 1.6);
  });
  const foot = tx(["PRESS 'ENTER' WHEN DONE."])[0];
  drawBig(ctx, foot, 120 - textWidth(foot) * 0.8, 126, C.white, 1.6);
  ctx.restore();
  drawPanel(ctx, state);
}
