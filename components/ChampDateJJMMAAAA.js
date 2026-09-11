// components/ChampDateJJMMAAAA.js
// Champ de saisie de date au format JJ/MM/AAAA garanti IDENTIQUE sur tous les appareils.
//
// Pourquoi : <input type="date"> natif stocke bien une valeur ISO (AAAA-MM-JJ) peu importe
// l'appareil, mais son AFFICHAGE (l'ordre jour/mois du texte et du calendrier) est dessiné par le
// système d'exploitation/navigateur -- pas par ce code. Un laptop réglé en JJ/MM et un téléphone
// réglé en MM/JJ montrent donc le même champ différemment, à confusion pour la saisie. Ce champ
// texte avec masque (slashs insérés automatiquement en tapant) impose le même format partout.
//
// Value/onChange restent en ISO (AAAA-MM-JJ ou '') comme un <input type="date"> classique -- aucun
// changement requis côté composants parents (dateEntree1, dateSortie1... restent des chaînes ISO).
const React = window.React;
const { useState, useEffect } = React;

function estDateValide(jj, mm, aaaa) {
  const j = Number(jj), m = Number(mm), a = Number(aaaa);
  if (a < 1900 || a > 2100 || m < 1 || m > 12) return false;
  const d = new Date(Date.UTC(a, m - 1, j));
  // Rejette les dates qui "débordent" (ex. 31/02) -- Date recalcule sinon vers le mois suivant.
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

function isoVersTexte(iso) {
  if (!iso) return '';
  const [aaaa, mm, jj] = iso.split('-');
  return (jj && mm && aaaa) ? `${jj}/${mm}/${aaaa}` : '';
}

function ChampDateJJMMAAAA({ value, onChange, className, id }) {
  const [texte, setTexte] = useState(isoVersTexte(value));

  // Resynchronise l'affichage si la valeur change depuis l'extérieur (chargement d'une fiche
  // existante pour modification, remise à zéro du calculateur...).
  useEffect(() => { setTexte(isoVersTexte(value)); }, [value]);

  const gererSaisie = (e) => {
    const chiffres = e.target.value.replace(/\D/g, '').slice(0, 8); // JJMMAAAA, chiffres seulement
    let formate = chiffres;
    if (chiffres.length > 4) formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
    else if (chiffres.length > 2) formate = `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
    setTexte(formate);

    if (chiffres.length === 0) { onChange(''); return; }
    if (chiffres.length === 8) {
      const jj = chiffres.slice(0, 2), mm = chiffres.slice(2, 4), aaaa = chiffres.slice(4);
      if (estDateValide(jj, mm, aaaa)) onChange(`${aaaa}-${mm}-${jj}`);
      // Sinon (ex. 31/02) : on n'appelle pas onChange -- la valeur ISO précédente est conservée
      // jusqu'à ce que la personne corrige la saisie vers une date réellement valide.
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="JJ/MM/AAAA"
      maxLength={10}
      value={texte}
      onChange={gererSaisie}
      className={className}
      id={id}
    />
  );
}

module.exports = ChampDateJJMMAAAA;
