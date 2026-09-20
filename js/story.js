/* An alternative story, chosen on the options page: instead of a pilot on
 * the alien boss's asteroid, a policeman in a rough district, sent in place of the
 * postman to carry the mailboxes to the sorting office. Only the words
 * change: every message, the panel and the title. The original's lines stay
 * the default. The font gains the Cyrillic letters it needs, in the same
 * four-by-six cells. */

Object.assign(GLYPHS, {
  "А": "699f99", "Б": "f8e99e", "В": "e9e99e", "Г": "f88888", "Д": "6555f9", "Е": "f8e88f", "Ё": "f8e88f",
  "Ж": "9f6f99", "З": "e1611e", "И": "99bd99", "Й": "49bd99", "К": "9acca9", "Л": "75555d", "М": "9ff999",
  "Н": "99f999", "О": "699996", "П": "f99999", "Р": "e9e888", "С": "788887", "Т": "f44444", "У": "997116",
  "Ф": "4eae44", "Х": "996699", "Ц": "9999f1", "Ч": "999711", "Ш": "bbbbbf", "Щ": "bbbbf1", "Ъ": "c46556",
  "Ы": "99dbbd", "Ь": "88e99e", "Э": "e1711e", "Ю": "abfbba", "Я": "799759",
});

// the original's lines, joined by |, and what the policeman's story says instead
const STORY = {
  "AI DARE": ["МЕНТ ДАРЕ"],
  "COP'S ADVENTURE": ["ПРИКЛЮЧЕНИЯ МЕНТА"],
  "PRESS 'FIRE' TO PLAY": ["ЖМИ 'ОГОНЬ' ЧТОБЫ ИГРАТЬ"],
  "OR '1' FOR OPTIONS": ["ИЛИ '1' ДЛЯ НАСТРОЕК"],
  "BEST  SCORES": ["ЛУЧШИЕ  СЧЕТА"],
  "AI DARE SPEEDS|OVER THE ASTEROID!": ["МЕНТ ЛЕТИТ", "НАД РАЙОНОМ!"],
  "THE SHIP STAYS BEHIND|TO AWAIT AI'S RETURN": ["МАШИНА ОСТАЁТСЯ", "ЖДАТЬ МЕНТА"],
  "\"YOU WILL NOT SUCCEED, DARE!\"": ["\"ПОСЫЛКИ НЕ ДОЙДУТ, МЕНТ!\""],
  "AI LANDS ON|THE ASTEROID": ["МЕНТ ПРИБЫВАЕТ", "В РАЙОН"],
  "INTRUDER ALERT !": ["ЧУЖОЙ НА РАЙОНЕ !"],
  "AI IS NOW IN SECTOR #": ["МЕНТ ТЕПЕРЬ В КВАРТАЛЕ #"],
  "\"I SAY....IT'S A HOLOGRAM !\"": ["\"ГЛЯДИ-КА... ЭТО ГОЛОГРАММА !\""],
  "\"NO! PUT THAT DOWN!\"": ["\"НЕТ! ПОЛОЖИ НА МЕСТО!\""],
  "THE SELF DESTRUCT ROOM": ["СОРТИРОВОЧНАЯ СТАНЦИЯ"],
  "AI CAN CRUSH FLOOR GUNS": ["МЕНТ ДАВИТ НАПОЛЬНЫЕ ПУШКИ"],
  "WALK TO THE LEFT|TO FIT THE PART": ["ИДИ ВЛЕВО,", "ЧТОБЫ СДАТЬ ЯЩИК"],
  "NOW TAKE IT TO THE|SELF-DESTRUCT SYSTEM": ["ТЕПЕРЬ НЕСИ ЕГО", "НА СОРТИРОВКУ"],
  "PART # FITTED": ["ЯЩИК # СДАН"],
  "A DOOR OPENS TO|THE NEXT SECTOR": ["ОТКРЫЛСЯ ПРОХОД", "В СЛЕДУЮЩИЙ КВАРТАЛ"],
  "THE SURVEY ENDS HERE|FOR NOW": ["ДАЛЬШЕ ПОКА", "НЕ РАЗВЕДАНО"],
  "\"11 MINUTES TO SELF DESTRUCT\"": ["\"11 МИНУТ ДО ОТПРАВКИ ПОЧТЫ\""],
  "OUT OF ORDER": ["НЕ РАБОТАЕТ"],
  "THIS ROOM IS SAFE": ["ТУТ ЧИСТО"],
  "AI FELL TOO FAR!": ["МЕНТ РАСШИБСЯ!"],
  "AI FALLS UNCONSCIOUS|FOR TEN MINUTES": ["МЕНТ ОТКЛЮЧИЛСЯ", "НА ДЕСЯТЬ МИНУТ"],
  "ENERGY RESTORED": ["СИЛЫ ВОССТАНОВЛЕНЫ"],
  "YOU WILL NOT|SUCCEED, DARE!": ["НИЧЕГО У ТЕБЯ", "НЕ ВЫЙДЕТ, МЕНТ!"],
  "THE ASTEROID CANNOT|BE STOPPED, DARE": ["ПОЧТА НЕ ПРОЙДЁТ,", "МЕНТ"],
  "MY GUARDS WILL|FIND YOU, DARE": ["МОИ ПАЦАНЫ", "ТЕБЯ НАЙДУТ, МЕНТ"],
  "TIME IS RUNNING|OUT, EARTHMAN": ["ВРЕМЯ ВЫХОДИТ,", "ЛЕГАВЫЙ"],
  "GIVE UP, DARE.|EARTH IS FINISHED": ["СДАВАЙСЯ, МЕНТ.", "РАЙОН НАШ"],
  "AI DARE MAKES A GETAWAY!": ["МЕНТ УЕЗЖАЕТ!"],
  "FIVE": ["ПЯТЬ"], "FOUR": ["ЧЕТЫРЕ"], "THREE": ["ТРИ"], "TWO": ["ДВА"], "ONE": ["ОДИН"],
  "WELL DONE SIR! THIS COULD|GET YOU YOUR KNIGHTHOOD!": ["МОЛОДЕЦ, СЕРЖАНТ!", "ЭТО ТЯНЕТ НА ЗВЁЗДОЧКУ!"],
  "OUT OF TIME": ["ВРЕМЯ ВЫШЛО"],
  "THE ASTEROID HITS EARTH": ["ПОЧТА УШЛА БЕЗ ЯЩИКОВ"],
  "GAME|OVER": ["ИГРА", "ВСЁ"],
  "SCORE #": ["СЧЁТ #"],
  "PARTS # OF 5": ["ЯЩИКИ # ИЗ 5"],
  "CONTROL  OPTIONS": ["НАСТРОЙКИ"],
  "KEYBOARD Q,A,O,P,SPACE": ["КЛАВИШИ Q,A,O,P,ПРОБЕЛ"],
  "CURSOR KEYS AND SPACE": ["СТРЕЛКИ И ПРОБЕЛ"],
  "STORY: AI DARE": ["СЮЖЕТ: МЕНТ ДАРЕ"],
  "THE ASTEROID IS COMING.": ["ПОЧТА ПРОПАЛА."],
  "AI DARE GOES IN ALONE.": ["МЕНТ ДАРЕ ИДЁТ ОДИН."],
  "PRESS 'ENTER' WHEN DONE.": ["ГОТОВО - ЖМИ 'ENTER'."],
  "PRESS SPACE": ["НАЖМИ ПРОБЕЛ"],
};

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
