// verse_picker.js — Nivi IA (shuffle-bag "siempre diferente")
(function(){
  const KEY = "niviVerseBag_v1";

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch(e){
      return null;
    }
  }

  function saveState(state){
    try{
      localStorage.setItem(KEY, JSON.stringify(state));
    }catch(e){}
  }

  function rebuild(n){
    const order = shuffle([...Array(n).keys()]);
    const state = { n, order, idx: 0 };
    saveState(state);
    return state;
  }

  // Devuelve el siguiente verso (nunca repite hasta agotar y reshuffle)
  window.pickNextVerse = function(){
    const verses = window.NIVI_VERSES || [];
    const n = verses.length;

    if (!n) return ["", ""];

    let state = loadState();
    if (!state || state.n !== n || !Array.isArray(state.order) || state.order.length !== n){
      state = rebuild(n);
    }

    const pickIndex = state.order[state.idx % n];
    state.idx = (state.idx + 1) % n;

    // si completamos una vuelta, reshuffle para la siguiente ronda
    if (state.idx === 0){
      state.order = shuffle(state.order);
    }

    saveState(state);
    return verses[pickIndex] || ["", ""];
  };
})();
