(() => {
  'use strict';

  const panel = document.getElementById('extra-quiz-panel');
  if (!panel) return;

  const questions = [
    {
      title: 'Куда сегодня тянет?',
      answers: [
        { label: 'Город без плана', note: 'Смотреть по сторонам', style: 'fedora' },
        { label: 'За горизонт', note: 'Дорога сама подскажет', style: 'cowboy' },
        { label: 'Кофе и прогулка', note: 'Никуда не торопиться', style: 'bucket' },
        { label: 'Вечер с выходом', note: 'Добавить немного театра', style: 'top-hat' }
      ]
    },
    {
      title: 'Какой у дня ритм?',
      answers: [
        { label: 'Тихо и уверенно', note: 'Каждая деталь на месте', style: 'fedora' },
        { label: 'На полной свободе', note: 'Без расписания', style: 'cowboy' },
        { label: 'Полегче ко всему', note: 'Пусть будет просто', style: 'bucket' },
        { label: 'С небольшой драмой', note: 'Почему бы и нет', style: 'top-hat' }
      ]
    },
    {
      title: 'И последний штрих — цвет.',
      answers: [
        { label: 'Сдержанность', note: 'Графит или тёмно-синий', colors: ['graphite', 'navy'] },
        { label: 'Тёплый свет', note: 'Песок или терракота', colors: ['sand', 'clay'] },
        { label: 'Зелёный маршрут', note: 'Олива или кремовый', colors: ['olive', 'cream'] },
        { label: 'Громкий акцент', note: 'Винный или сливовый', colors: ['wine', 'plum'] }
      ]
    }
  ];
  const profiles = {
    fedora: { title: 'Городской наблюдатель', description: 'Замечать детали, сворачивать в незнакомые переулки и всегда иметь собственное мнение. Вам идёт собранный силуэт.', name: 'Федора', symbol: '↗' },
    cowboy: { title: 'Искатель горизонтов', description: 'В планах — свобода. Широкие поля и выразительный изгиб подойдут этому настроению лучше любого расписания.', name: 'Ковбойская', symbol: '↝' },
    bucket: { title: 'Мастер лёгкого шага', description: 'Хороший день не обязан быть сложным. Мягкая панама, удобный маршрут и время на ещё одну чашку кофе.', name: 'Панама', symbol: '✳' },
    'top-hat': { title: 'Режиссёр своего вечера', description: 'Чуть больше выразительности, чуть меньше обычного. Высокий цилиндр поддержит настроение, которому тесно в повседневности.', name: 'Цилиндр', symbol: '✦' }
  };
  const colorNames = { graphite: 'Графит', clay: 'Терракота', olive: 'Олива', sand: 'Песок', wine: 'Винный', navy: 'Тёмно-синий', cream: 'Кремовый', plum: 'Сливовый' };
  const styleOrder = Object.keys(profiles);
  const selections = [null, null, null];
  let currentQuestion = 0;
  let recommendation = null;

  const step = document.getElementById('extra-quiz-step');
  const progress = document.getElementById('extra-quiz-progress');
  const title = document.getElementById('extra-quiz-question');
  const answers = document.getElementById('extra-quiz-answers');
  const questionView = document.getElementById('extra-quiz-questions');
  const resultView = document.getElementById('extra-quiz-result');
  const next = document.getElementById('extra-quiz-next');
  const back = document.getElementById('extra-quiz-back');
  const reset = document.getElementById('extra-quiz-reset');
  const status = document.getElementById('extra-quiz-status');

  function renderQuestion(shouldFocus = false) {
    const question = questions[currentQuestion];
    questionView.hidden = false;
    resultView.hidden = true;
    title.textContent = question.title;
    step.textContent = `ВОПРОС ${String(currentQuestion + 1).padStart(2, '0')} / 03`;
    progress.value = currentQuestion + 1;
    progress.setAttribute('aria-label', `Прогресс теста: вопрос ${currentQuestion + 1} из 3`);
    back.hidden = currentQuestion === 0;
    reset.hidden = currentQuestion === 0 && selections.every(value => value === null);
    next.disabled = selections[currentQuestion] === null;
    next.firstChild.textContent = currentQuestion === questions.length - 1 ? 'Узнать свой образ ' : 'Дальше ';

    const fragment = document.createDocumentFragment();
    question.answers.forEach((answer, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-answer';
      button.setAttribute('aria-pressed', String(selections[currentQuestion] === index));
      const indicator = document.createElement('span');
      indicator.className = 'quiz-answer-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'quiz-answer-copy';
      const label = document.createElement('strong');
      label.textContent = answer.label;
      const note = document.createElement('small');
      note.textContent = answer.note;
      copy.append(label, note);
      button.append(indicator, copy);
      button.addEventListener('click', () => {
        selections[currentQuestion] = index;
        for (const candidate of answers.children) candidate.setAttribute('aria-pressed', String(candidate === button));
        next.disabled = false;
        reset.hidden = false;
      });
      fragment.append(button);
    });
    answers.replaceChildren(fragment);
    if (shouldFocus) {
      status.textContent = `Вопрос ${currentQuestion + 1} из 3`;
      title.focus({ preventScroll: true });
    }
  }

  function showResult() {
    if (selections.some(value => value === null)) return;
    const firstStyle = questions[0].answers[selections[0]].style;
    const secondStyle = questions[1].answers[selections[1]].style;
    const scores = Object.fromEntries(styleOrder.map(style => [style, 0]));
    scores[firstStyle] += 2;
    scores[secondStyle] += 2;
    scores[styleOrder[selections[2]]] += 1;
    // A tied route and rhythm are settled by the palette; otherwise the route leads.
    const style = styleOrder.reduce((best, candidate) => scores[candidate] > scores[best] ? candidate : best, firstStyle);
    const chosenColors = questions[2].answers[selections[2]].colors;
    const color = chosenColors[style === 'top-hat' || style === 'cowboy' ? 1 : 0];
    recommendation = { style, color };
    const profile = profiles[style];
    document.getElementById('extra-quiz-result-title').textContent = profile.title;
    document.getElementById('extra-quiz-description').textContent = profile.description;
    document.getElementById('extra-quiz-combination').textContent = `${profile.name} · ${colorNames[color]}`;
    document.getElementById('extra-quiz-symbol').textContent = profile.symbol;
    questionView.hidden = true;
    resultView.hidden = false;
    reset.hidden = false;
    step.textContent = 'ОБРАЗ НАЙДЕН';
    progress.value = 3;
    progress.setAttribute('aria-label', 'Тест завершён');
    status.textContent = `Ваш образ: ${profile.title}. ${profile.name}, цвет ${colorNames[color]}.`;
    document.getElementById('extra-quiz-result-title').focus({ preventScroll: true });
  }

  next.addEventListener('click', () => {
    if (selections[currentQuestion] === null) return;
    if (currentQuestion === questions.length - 1) showResult();
    else { currentQuestion += 1; renderQuestion(true); }
  });
  back.addEventListener('click', () => {
    if (currentQuestion > 0) { currentQuestion -= 1; renderQuestion(true); }
  });
  reset.addEventListener('click', () => {
    selections.fill(null);
    currentQuestion = 0;
    recommendation = null;
    renderQuestion(true);
  });
  document.getElementById('extra-quiz-try').addEventListener('click', () => {
    if (recommendation && styleOrder.includes(recommendation.style)) {
      window.dispatchEvent(new CustomEvent('hat:recommend', { detail: { ...recommendation } }));
    }
  });
  renderQuestion();

  const thoughts = [
    'Если день не задался, задайте ему поля.',
    'Настроение меняется. Шляпа успевает первой.',
    'У хорошей прогулки всегда есть небольшой козырь.',
    'Не всё нужно держать под контролем. Иногда достаточно держать шляпу.',
    'Большие планы начинаются с малого: выйти из дома красиво.',
    'Снимайте шляпу перед людьми. Надевайте — перед приключениями.'
  ];
  const thoughtText = document.getElementById('extra-thought-text');
  const thoughtCount = document.getElementById('extra-thought-count');
  const thoughtButton = document.getElementById('extra-next-thought');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentThought = 0;
  let thoughtTimer;

  function updateThought() {
    const offset = 1 + Math.floor(Math.random() * (thoughts.length - 1));
    currentThought = (currentThought + offset) % thoughts.length;
    thoughtText.textContent = thoughts[currentThought];
    thoughtCount.textContent = `МЫСЛЬ ${String(currentThought + 1).padStart(2, '0')} / ${String(thoughts.length).padStart(2, '0')}`;
    thoughtText.classList.remove('is-updating');
    thoughtButton.disabled = false;
  }

  thoughtButton.addEventListener('click', () => {
    clearTimeout(thoughtTimer);
    if (motionPreference.matches) updateThought();
    else {
      thoughtButton.disabled = true;
      thoughtText.classList.add('is-updating');
      thoughtTimer = setTimeout(updateThought, 160);
    }
  });
})();
