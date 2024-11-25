import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, onSnapshot, deleteDoc, doc} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import UitgavenFilter from './UitgavenFilter';
import ConfirmDialog from './ConfirmDialog';
import UitgavenSortering from './UitgavenSortering';

export default function UitgavenLijst() {
  const [uitgaven, setUitgaven] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();
  const db = getFirestore();
  const [filters, setFilters] = useState({
    maand: new Date().getMonth() + 1,
    jaar: new Date().getFullYear(),
    categorie: 'alle'
  });
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    uitgaveId: null
  });
  const [sorteerOptie, setSorteerOptie] = useState({
    veld: 'datum',
    richting: 'desc'
  });
  const [zoekTerm, setZoekTerm] = useState('');
  const [paginaGrootte] = useState(10);
  const [huidigePagina, setHuidigePagina] = useState(1);

  useEffect(() => {
    if (!currentUser) return;

    const uitgavenRef = collection(db, 'uitgaven');
    let queryConstraints = [
      where('userId', '==', currentUser.uid),
      where('jaar', '==', filters.jaar)
    ];

    if (filters.maand !== 'alle') {
      queryConstraints.push(where('maand', '==', filters.maand));
    }

    if (filters.categorie !== 'alle') {
      queryConstraints.push(where('categorie', '==', filters.categorie));
    }

    const q = query(uitgavenRef, ...queryConstraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const nieuweUitgaven = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .sort((a, b) => new Date(b.datum) - new Date(a.datum));

        setUitgaven(nieuweUitgaven);
        setLoading(false);
        setError('');
      } catch (err) {
        console.error('Fout bij verwerken data:', err);
        setError('Fout bij verwerken uitgaven.');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [currentUser, db, filters]);

  const handleVerwijder = (uitgaveId) => {
    setConfirmDialog({
      isOpen: true,
      uitgaveId
    });
  };

  const verwijderUitgave = async () => {
    if (!currentUser || !confirmDialog.uitgaveId) return;
    
    try {
      setError('');
      const uitgaveRef = doc(db, 'uitgaven', confirmDialog.uitgaveId);
      await deleteDoc(uitgaveRef);
      setConfirmDialog({ isOpen: false, uitgaveId: null });
    } catch (error) {
      console.error('Fout bij verwijderen:', error);
      setError('Fout bij verwijderen uitgave.');
    }
  };

  const sorterenUitgaven = (uitgaven) => {
    return [...uitgaven].sort((a, b) => {
      let vergelijking;

      switch (sorteerOptie.veld) {
        case 'datum':
          vergelijking = new Date(b.datum) - new Date(a.datum);
          return sorteerOptie.richting === 'desc' ? vergelijking : -vergelijking;
        case 'bedrag':
          vergelijking = b.bedrag - a.bedrag;
          return sorteerOptie.richting === 'desc' ? vergelijking : -vergelijking;
        case 'categorie':
          vergelijking = a.categorie.localeCompare(b.categorie);
          return sorteerOptie.richting === 'desc' ? -vergelijking : vergelijking;
        default:
          return 0;
      }
    });
  };

  const exporteerNaarCSV = () => {
    if (uitgaven.length === 0) return;

    const headers = ['Datum', 'Bedrag', 'Beschrijving', 'Categorie'];
    const csvData = uitgaven.map(uitgave => [
      new Date(uitgave.datum).toLocaleDateString('nl-NL'),
      uitgave.bedrag.toFixed(2),
      uitgave.beschrijving,
      uitgave.categorie
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `uitgaven_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filterUitgaven = (uitgaven) => {
    if (!zoekTerm) return uitgaven;
    
    const zoekTermLower = zoekTerm.toLowerCase();
    return uitgaven.filter(uitgave => 
      uitgave.beschrijving.toLowerCase().includes(zoekTermLower) ||
      uitgave.categorie.toLowerCase().includes(zoekTermLower) ||
      uitgave.bedrag.toString().includes(zoekTermLower)
    );
  };

  const pagineerUitgaven = (uitgaven) => {
    const startIndex = (huidigePagina - 1) * paginaGrootte;
    const eindIndex = startIndex + paginaGrootte;
    return uitgaven.slice(startIndex, eindIndex);
  };

  return (
    <div className="uitgaven-lijst">
      <h2>Uitgaven Overzicht</h2>
      <UitgavenFilter filters={filters} setFilters={setFilters} />
      
      <div className="zoek-balk">
        <input
          type="text"
          placeholder="Zoek in uitgaven..."
          value={zoekTerm}
          onChange={(e) => setZoekTerm(e.target.value)}
          className="zoek-input"
        />
      </div>

      <div className="uitgaven-acties">
        <UitgavenSortering sorteerOptie={sorteerOptie} setSorteerOptie={setSorteerOptie} />
        <button 
          onClick={exporteerNaarCSV}
          className="exporteer-button"
          disabled={uitgaven.length === 0}
        >
          Exporteer naar CSV
        </button>
      </div>
      
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, uitgaveId: null })}
        onConfirm={verwijderUitgave}
        title="Uitgave Verwijderen"
        message="Weet je zeker dat je deze uitgave wilt verwijderen?"
      />
      
      {loading ? (
        <div className="loading">Laden...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : uitgaven.length === 0 ? (
        <p>Geen uitgaven gevonden.</p>
      ) : (
        <>
          {pagineerUitgaven(sorterenUitgaven(filterUitgaven(uitgaven))).map((uitgave) => (
            <div key={uitgave.id} className="uitgave-item">
              <div className="uitgave-content">
                <p className="uitgave-bedrag">€{uitgave.bedrag.toFixed(2)} - {uitgave.beschrijving}</p>
                <p className="uitgave-meta">
                  {new Date(uitgave.datum).toLocaleDateString('nl-NL')} | 
                  Categorie: {uitgave.categorie}
                </p>
              </div>
              <button 
                onClick={() => handleVerwijder(uitgave.id)}
                className="verwijder-button"
              >
                Verwijderen
              </button>
            </div>
          ))}
          
          <div className="paginering">
            <button 
              onClick={() => setHuidigePagina(prev => Math.max(prev - 1, 1))}
              disabled={huidigePagina === 1}
              className="paginering-button"
            >
              Vorige
            </button>
            
            <span className="pagina-info">
              Pagina {huidigePagina} van {Math.ceil(filterUitgaven(uitgaven).length / paginaGrootte)}
            </span>
            
            <button 
              onClick={() => setHuidigePagina(prev => prev + 1)}
              disabled={huidigePagina >= Math.ceil(filterUitgaven(uitgaven).length / paginaGrootte)}
              className="paginering-button"
            >
              Volgende
            </button>
          </div>
        </>
      )}
    </div>
  );
}