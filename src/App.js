import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';

function App() {
  const [currentDictionary, setCurrentDictionary] = useState(null);
  const [prefixCounts, setPrefixCounts] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lengthFilter, setLengthFilter] = useState('all');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [expandedPattern, setExpandedPattern] = useState(null);
  const [mode, setMode] = useState('explore'); // 'explore', 'learn', or 'repeat'
  const [learnMode, setLearnMode] = useState('find'); // 'find' or 'repeat'
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Learn mode state
  const [selectedPatterns, setSelectedPatterns] = useState([]);
  const [customPatternInput, setCustomPatternInput] = useState('');
  const [patternTypeFilter, setPatternTypeFilter] = useState('all'); // 'all', 'ends', 'starts'
  const [isStudying, setIsStudying] = useState(false);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [foundWords, setFoundWords] = useState(new Set());
  const [attemptedWords, setAttemptedWords] = useState(new Set());

  // Repeat after me mode state
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [repeatCount, setRepeatCount] = useState(0);
  const [hideWord, setHideWord] = useState(false);

  // Load dictionary and prefix counts
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load dictionary
        const dictResponse = await fetch(`${process.env.PUBLIC_URL}/dict_english.json`);
        if (!dictResponse.ok) {
          throw new Error(`Failed to load dictionary (${dictResponse.status})`);
        }
        const words = await dictResponse.json();
        setCurrentDictionary(words);

        // Load prefix counts
        const prefixResponse = await fetch(`${process.env.PUBLIC_URL}/prefix_count.json`);
        if (!prefixResponse.ok) {
          throw new Error(`Failed to load prefix counts (${prefixResponse.status})`);
        }
        const prefixes = await prefixResponse.json();
        setPrefixCounts(prefixes);

        setIsLoading(false);
      } catch (err) {
        setError(`Error loading data: ${err.message}`);
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Build indexed lookup maps for fast searching
  const wordIndices = useMemo(() => {
    if (!currentDictionary) return { endsMap: new Map(), startsMap: new Map() };

    const endsMap = new Map();
    const startsMap = new Map();

    // Build indices by pre-computing all possible endings and starts for each word
    currentDictionary.forEach(word => {
      const lowerWord = word.toLowerCase();

      // Index all possible endings (2-8 letters)
      for (let len = 2; len <= Math.min(8, lowerWord.length); len++) {
        const ending = lowerWord.slice(-len);
        if (!endsMap.has(ending)) {
          endsMap.set(ending, []);
        }
        endsMap.get(ending).push(word);
      }

      // Index all possible starts (2-8 letters)
      for (let len = 2; len <= Math.min(8, lowerWord.length); len++) {
        const start = lowerWord.slice(0, len);
        if (!startsMap.has(start)) {
          startsMap.set(start, []);
        }
        startsMap.get(start).push(word);
      }
    });

    return { endsMap, startsMap };
  }, [currentDictionary]);

  // Analyze patterns from prefix_count.json and group by pattern text
  const patternsData = useMemo(() => {
    if (!currentDictionary || !prefixCounts || !wordIndices) return [];

    const patternGroups = new Map();
    const { endsMap, startsMap } = wordIndices;

    // For each pattern in prefix_count.json, group starts and ends together
    Object.entries(prefixCounts).forEach(([pattern, data]) => {
      const lowerPattern = pattern.toLowerCase();

      // Get words that END and START with this pattern
      const wordsEndingWith = endsMap.get(lowerPattern) || [];
      const wordsStartingWith = startsMap.get(lowerPattern) || [];

      // Create grouped pattern if either has 2+ words
      if (wordsEndingWith.length >= 2 || wordsStartingWith.length >= 2) {
        patternGroups.set(lowerPattern, {
          pattern: lowerPattern,
          length: data.length,
          endsWords: wordsEndingWith,
          endsCount: wordsEndingWith.length,
          startsWords: wordsStartingWith,
          startsCount: wordsStartingWith.length,
          totalCount: wordsEndingWith.length + wordsStartingWith.length
        });
      }
    });

    // Convert to array and sort by total count (rarest first)
    return Array.from(patternGroups.values()).sort((a, b) => a.totalCount - b.totalCount);
  }, [currentDictionary, prefixCounts, wordIndices]);

  // Get rarity class
  const getRarityClass = useCallback((count) => {
    if (count <= 5) return 'ultra-rare';
    if (count <= 10) return 'rare';
    if (count <= 50) return 'uncommon';
    if (count <= 200) return 'common';
    return 'very-common';
  }, []);

  // Filter patterns
  const filteredPatterns = useMemo(() => {
    let filtered = [...patternsData];

    // Search filter - match patterns that end or start with query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.pattern.endsWith(query) || p.pattern.startsWith(query)
      );
    }

    // Length filter
    if (lengthFilter !== 'all') {
      filtered = filtered.filter(p => p.length === parseInt(lengthFilter));
    }

    // Rarity filter (based on total count)
    if (rarityFilter !== 'all') {
      filtered = filtered.filter(p => getRarityClass(p.totalCount) === rarityFilter);
    }

    return filtered;
  }, [patternsData, searchQuery, lengthFilter, rarityFilter, getRarityClass]);

  // Paginated patterns
  const paginatedPatterns = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    return filteredPatterns.slice(startIdx, endIdx);
  }, [filteredPatterns, currentPage]);

  const totalPages = Math.ceil(filteredPatterns.length / itemsPerPage);

  // Rare patterns for learning - split grouped patterns into separate entries
  const rarePatterns = useMemo(() => {
    let patterns = [];

    // Split grouped patterns into separate ends/starts entries for learning
    patternsData.forEach(p => {
      // Add ends pattern if it meets criteria
      if (p.endsCount >= 2 && p.endsCount <= 15 && p.length >= 3) {
        patterns.push({
          pattern: p.pattern,
          type: 'ends',
          length: p.length,
          words: p.endsWords,
          count: p.endsCount
        });
      }

      // Add starts pattern if it meets criteria
      if (p.startsCount >= 2 && p.startsCount <= 15 && p.length >= 3) {
        patterns.push({
          pattern: p.pattern,
          type: 'starts',
          length: p.length,
          words: p.startsWords,
          count: p.startsCount
        });
      }
    });

    // Filter by pattern type (prefixes/suffixes)
    if (patternTypeFilter !== 'all') {
      patterns = patterns.filter(p => p.type === patternTypeFilter);
    }

    // Filter by custom pattern input - match exact endings/beginnings
    if (customPatternInput.trim()) {
      const query = customPatternInput.toLowerCase().trim();
      patterns = patterns.filter(p => {
        // For endings: check if pattern ends with query
        if (p.type === 'ends') {
          return p.pattern.endsWith(query);
        }
        // For starts: check if pattern starts with query
        if (p.type === 'starts') {
          return p.pattern.startsWith(query);
        }
        return false;
      });
    }

    return patterns;
  }, [patternsData, customPatternInput, patternTypeFilter]);

  // Current challenge pattern - use rarePatterns which has the split structure
  const currentChallenge = useMemo(() => {
    if (!isStudying || selectedPatterns.length === 0) return null;
    const patternKey = selectedPatterns[currentChallengeIndex % selectedPatterns.length];
    return rarePatterns.find(p => `${p.pattern}_${p.type}` === patternKey);
  }, [isStudying, selectedPatterns, currentChallengeIndex, rarePatterns]);

  // Handlers
  const toggleExpand = useCallback((pattern) => {
    setExpandedPattern(prev => prev === pattern ? null : pattern);
  }, []);

  const handlePageChange = useCallback((direction) => {
    setCurrentPage(prev => prev + direction);
    window.scrollTo(0, 0);
  }, []);

  const togglePatternSelection = useCallback((patternKey) => {
    setSelectedPatterns(prev =>
      prev.includes(patternKey)
        ? prev.filter(p => p !== patternKey)
        : [...prev, patternKey]
    );
  }, []);

  const selectAllRare = useCallback(() => {
    const allRareKeys = rarePatterns.map(p => `${p.pattern}_${p.type}`);
    setSelectedPatterns(allRareKeys);
  }, [rarePatterns]);

  const startStudy = useCallback((mode = 'find') => {
    if (selectedPatterns.length === 0) {
      alert('Please select at least one pattern to study!');
      return;
    }
    setLearnMode(mode);
    setIsStudying(true);
    setCurrentChallengeIndex(0);
    setCorrectAnswers(0);
    setTotalAttempts(0);
    setShowAnswer(false);
    setUserAnswer('');
    setFoundWords(new Set());
    setAttemptedWords(new Set());
    setCurrentWordIndex(0);
    setRepeatCount(0);
    setHideWord(false);
  }, [selectedPatterns]);

  const checkAnswer = useCallback(() => {
    if (!currentChallenge || !userAnswer.trim()) return;

    const userInput = userAnswer.toLowerCase().trim();
    const pattern = currentChallenge.pattern.toLowerCase();

    // Construct the full word based on pattern type
    let fullWord;
    if (currentChallenge.type === 'ends') {
      // User types the beginning, we add the ending
      fullWord = userInput + pattern;
    } else {
      // User types the ending, we add the beginning
      fullWord = pattern + userInput;
    }

    // Check if already attempted this combination
    if (attemptedWords.has(fullWord)) {
      setUserAnswer('');
      return;
    }

    setAttemptedWords(prev => new Set([...prev, fullWord]));

    // Check if the constructed word matches any valid word
    const matchedWord = currentChallenge.words.find(
      dictWord => dictWord.toLowerCase() === fullWord
    );

    if (matchedWord && !foundWords.has(fullWord)) {
      setFoundWords(prev => new Set([...prev, fullWord]));
      setCorrectAnswers(prev => prev + 1);
    }

    setTotalAttempts(prev => prev + 1);
    setUserAnswer('');
  }, [currentChallenge, userAnswer, foundWords, attemptedWords]);

  const showAllWords = useCallback(() => {
    setShowAnswer(true);
    if (foundWords.size === 0) {
      setTotalAttempts(prev => prev + 1);
    }
  }, [foundWords]);

  // Repeat after me mode handlers
  const checkRepeatWord = useCallback(() => {
    if (!currentChallenge || !userAnswer.trim()) return;

    const currentWord = currentChallenge.words[currentWordIndex];
    const userWord = userAnswer.trim().toLowerCase();
    const correctWord = currentWord.toLowerCase();

    if (userWord === correctWord) {
      if (hideWord) {
        // User typed it correctly while hidden - move to next word
        setCurrentWordIndex(prev => prev + 1);
        setRepeatCount(0);
        setHideWord(false);
        setCorrectAnswers(prev => prev + 1);
      } else {
        // User typed it correctly while visible - increment count
        const newRepeatCount = repeatCount + 1;
        setRepeatCount(newRepeatCount);

        if (newRepeatCount >= 3) {
          // After 3 correct repetitions, hide the word
          setHideWord(true);
          setRepeatCount(0);
        }
      }
    }

    setTotalAttempts(prev => prev + 1);
    setUserAnswer('');
  }, [currentChallenge, userAnswer, currentWordIndex, repeatCount, hideWord]);

  const skipRepeatWord = useCallback(() => {
    setCurrentWordIndex(prev => prev + 1);
    setRepeatCount(0);
    setHideWord(false);
    setUserAnswer('');
  }, []);

  const nextChallenge = useCallback(() => {
    setCurrentChallengeIndex(prev => prev + 1);
    setUserAnswer('');
    setShowAnswer(false);
    setFoundWords(new Set());
    setAttemptedWords(new Set());
    setCurrentWordIndex(0);
    setRepeatCount(0);
    setHideWord(false);
  }, []);

  const resetStudy = useCallback(() => {
    setIsStudying(false);
    setSelectedPatterns([]);
    setCurrentChallengeIndex(0);
    setCorrectAnswers(0);
    setTotalAttempts(0);
    setShowAnswer(false);
    setUserAnswer('');
    setFoundWords(new Set());
    setAttemptedWords(new Set());
    setCurrentWordIndex(0);
    setRepeatCount(0);
    setHideWord(false);
    setLearnMode('find');
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, lengthFilter, rarityFilter]);

  if (isLoading) {
    return (
      <div className="app">
        <div className="container">
          <div className="loading">Loading dictionary...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="container">
          <div className="error">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <h1>🤪 Goofy's Jargon</h1>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'explore' ? 'active' : ''}`}
              onClick={() => setMode('explore')}
            >
              📚 Explore
            </button>
            <button
              className={`mode-btn ${mode === 'learn' ? 'active' : ''}`}
              onClick={() => setMode('learn')}
            >
              🧠 Learn
            </button>
          </div>
        </div>

        {mode === 'explore' && (
          <div className="explore-mode">
            <div className="search-section">
              <div className="search-controls">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by ending letters (e.g., 'tion', 'ing') or beginning letters (e.g., 'pre', 'un')..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="filter-select"
                  value={lengthFilter}
                  onChange={(e) => setLengthFilter(e.target.value)}
                >
                  <option value="all">All Lengths</option>
                  <option value="2">2 Letters</option>
                  <option value="3">3 Letters</option>
                  <option value="4">4 Letters</option>
                </select>
                <select
                  className="filter-select"
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value)}
                >
                  <option value="all">All Rarities</option>
                  <option value="ultra-rare">Ultra Rare (≤5)</option>
                  <option value="rare">Rare (≤10)</option>
                  <option value="uncommon">Uncommon (≤50)</option>
                  <option value="common">Common (≤200)</option>
                  <option value="very-common">Very Common (>200)</option>
                </select>
              </div>
              <div className="stats">
                Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredPatterns.length)} of {filteredPatterns.length} patterns • Sorted by rarity (rarest first)
              </div>
              {totalPages > 1 && (
                <div className="pagination">
                  <button onClick={() => handlePageChange(-1)} disabled={currentPage === 1}>
                    ← Previous
                  </button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button onClick={() => handlePageChange(1)} disabled={currentPage === totalPages}>
                    Next →
                  </button>
                </div>
              )}
            </div>

            <div className="patterns-list">
              {paginatedPatterns.map((pattern) => {
                const isExpanded = expandedPattern === pattern.pattern;
                return (
                  <div key={pattern.pattern} className="pattern-item">
                    <div
                      className="pattern-header"
                      onClick={() => toggleExpand(pattern.pattern)}
                    >
                      <div className="pattern-info">
                        <span className="pattern-text">
                          {pattern.pattern.toUpperCase()}
                        </span>
                        <span className={`rarity-badge ${getRarityClass(pattern.totalCount)}`}>
                          {pattern.totalCount} total word{pattern.totalCount !== 1 ? 's' : ''}
                        </span>
                        <span className="length-badge">
                          {pattern.length}L
                        </span>
                        {pattern.endsCount > 0 && (
                          <span className="type-badge ends-badge">
                            {pattern.endsCount} ending
                          </span>
                        )}
                        {pattern.startsCount > 0 && (
                          <span className="type-badge starts-badge">
                            {pattern.startsCount} starting
                          </span>
                        )}
                      </div>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && (
                      <div className="words-expanded">
                        {pattern.endsCount > 0 && (
                          <div className="word-section">
                            <h4 className="section-title">Words ending with -{pattern.pattern.toUpperCase()}:</h4>
                            <div className="words-grid">
                              {pattern.endsWords.map((word, i) => (
                                <div key={`end-${word}-${i}`} className="word-chip ends-chip">
                                  {word}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {pattern.startsCount > 0 && (
                          <div className="word-section">
                            <h4 className="section-title">Words starting with {pattern.pattern.toUpperCase()}-:</h4>
                            <div className="words-grid">
                              {pattern.startsWords.map((word, i) => (
                                <div key={`start-${word}-${i}`} className="word-chip starts-chip">
                                  {word}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'learn' && (
          <div className="learn-mode">
            {!isStudying ? (
              <div className="selection-section">
                {/* Step 1: Choose Pattern Type */}
                <div className="mode-selection-section">
                  <h3>Step 1: Choose What to Learn</h3>
                  <div className="mode-toggle">
                    <button
                      className={`mode-btn ${patternTypeFilter === 'ends' ? 'active' : ''}`}
                      onClick={() => setPatternTypeFilter('ends')}
                    >
                      📝 Suffixes (Word Endings)
                    </button>
                    <button
                      className={`mode-btn ${patternTypeFilter === 'starts' ? 'active' : ''}`}
                      onClick={() => setPatternTypeFilter('starts')}
                    >
                      📝 Prefixes (Word Beginnings)
                    </button>
                    <button
                      className={`mode-btn ${patternTypeFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setPatternTypeFilter('all')}
                    >
                      📚 Both
                    </button>
                  </div>
                </div>

                {/* Step 2: Choose Game Mode */}
                <div className="mode-selection-section">
                  <h3>Step 2: Choose Game Mode</h3>
                  <div className="game-mode-cards">
                    <div className={`game-mode-card ${learnMode === 'find' ? 'selected' : ''}`} onClick={() => setLearnMode('find')}>
                      <div className="game-mode-icon">🔍</div>
                      <h4>Find Words</h4>
                      <p>Type word parts to complete the pattern. Test your recall!</p>
                    </div>
                    <div className={`game-mode-card ${learnMode === 'repeat' ? 'selected' : ''}`} onClick={() => setLearnMode('repeat')}>
                      <div className="game-mode-icon">🔁</div>
                      <h4>Repeat After Me</h4>
                      <p>Type each word 3 times, then from memory. Build muscle memory!</p>
                    </div>
                  </div>
                </div>

                {/* Step 3: Filter and Select Patterns */}
                <div className="custom-pattern-section">
                  <h3>Step 3: Filter Patterns (Optional)</h3>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Type to filter patterns (e.g., 'tion', 'ing', 'pre', 'un')..."
                    value={customPatternInput}
                    onChange={(e) => setCustomPatternInput(e.target.value)}
                  />
                  <p className="helper-text">
                    Leave empty to see all rare patterns (2-15 words, 3+ letters).
                  </p>
                </div>

                <h3>
                  Step 4: Select Patterns to Practice
                  {customPatternInput && ` (matching "${customPatternInput}")`}
                  {patternTypeFilter !== 'all' && ` - ${patternTypeFilter === 'ends' ? 'Suffixes' : 'Prefixes'} only`}:
                </h3>
                <div className="patterns-selection">
                  {rarePatterns.length > 0 ? (
                    rarePatterns.map((pattern) => {
                      const key = `${pattern.pattern}_${pattern.type}`;
                      return (
                        <label key={key} className="pattern-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedPatterns.includes(key)}
                            onChange={() => togglePatternSelection(key)}
                          />
                          <span>
                            {pattern.type === 'ends' ? '-' : ''}{pattern.pattern.toUpperCase()}{pattern.type === 'starts' ? '-' : ''}
                            {' '}({pattern.count} words)
                            <span className="pattern-type-label">
                              {pattern.type === 'ends' ? ' [suffix]' : ' [prefix]'}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="no-patterns-message">
                      No patterns found matching your criteria. Try adjusting your search or filters.
                    </div>
                  )}
                </div>
                <div className="study-controls">
                  <button className="btn btn-info" onClick={selectAllRare}>
                    Select All Visible
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => startStudy(learnMode)}
                    disabled={selectedPatterns.length === 0}
                  >
                    Start {learnMode === 'find' ? 'Find Words' : 'Repeat After Me'} ({selectedPatterns.length} selected)
                  </button>
                </div>
              </div>
            ) : (
              <div className="challenge-area">
                <div className="challenge-card">
                  <div className="score">
                    Score: {correctAnswers}/{totalAttempts} ({totalAttempts > 0 ? Math.round((correctAnswers / totalAttempts) * 100) : 0}%)
                  </div>
                  <div className="challenge-pattern">
                    <span className="challenge-label">
                      {currentChallenge?.type === 'ends' ? 'Words ending with:' : 'Words starting with:'}
                    </span>
                    <span className="challenge-pattern-text">
                      {currentChallenge?.type === 'ends' ? '-' : ''}{currentChallenge?.pattern.toUpperCase()}{currentChallenge?.type === 'starts' ? '-' : ''}
                    </span>
                    <span className="challenge-hint">
                      ({currentChallenge?.count} words total)
                    </span>
                  </div>

                  {learnMode === 'repeat' ? (
                    // Repeat After Me Mode
                    currentWordIndex < (currentChallenge?.words.length || 0) ? (
                      <div className="repeat-mode-section">
                        <div className="repeat-word-display">
                          <h3>
                            {hideWord ? (
                              <span className="hidden-word">Type the word from memory!</span>
                            ) : (
                              <span className="visible-word">{currentChallenge?.words[currentWordIndex]}</span>
                            )}
                          </h3>
                          <p className="repeat-instruction">
                            {hideWord
                              ? 'Now type it without looking!'
                              : `Type this word ${3 - repeatCount} more time${3 - repeatCount !== 1 ? 's' : ''}`
                            }
                          </p>
                          <div className="progress-dots">
                            {[0, 1, 2].map(i => (
                              <span
                                key={i}
                                className={`progress-dot ${i < repeatCount ? 'completed' : ''}`}
                              >
                                {i < repeatCount ? '✓' : '○'}
                              </span>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          className="answer-input"
                          placeholder="Type the word..."
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && checkRepeatWord()}
                          autoFocus
                        />
                        <div className="word-progress">
                          Word {currentWordIndex + 1} of {currentChallenge?.words.length}
                        </div>
                        <div className="challenge-actions">
                          <button className="btn btn-primary" onClick={checkRepeatWord}>
                            Submit
                          </button>
                          <button className="btn btn-secondary" onClick={skipRepeatWord}>
                            Skip Word
                          </button>
                          <button className="btn btn-info" onClick={resetStudy}>
                            End Practice
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="completion-section">
                        <h3>🎉 Pattern Complete!</h3>
                        <p>You've practiced all {currentChallenge?.words.length} words for this pattern.</p>
                        <div className="challenge-actions">
                          <button className="btn btn-info" onClick={nextChallenge}>
                            Next Pattern →
                          </button>
                          <button className="btn btn-secondary" onClick={resetStudy}>
                            End Practice
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    // Find Words Mode
                    !showAnswer ? (
                      <div className="answer-section">
                        <div className="found-words-display">
                          <h4>Found Words ({foundWords.size} / {currentChallenge?.count}):</h4>
                          <div className="words-grid">
                            {foundWords.size > 0 ? (
                              Array.from(foundWords).map((word, i) => (
                                <div key={`found-${word}-${i}`} className="word-chip correct">
                                  ✓ {word}
                                </div>
                              ))
                            ) : (
                              <div className="no-words-message">Type words below to find them!</div>
                            )}
                          </div>
                        </div>
                        <div className="input-with-pattern">
                          {currentChallenge?.type === 'ends' ? (
                            <div className="pattern-input-container">
                              <input
                                type="text"
                                className="answer-input pattern-aware"
                                placeholder="Type the beginning..."
                                value={userAnswer}
                                onChange={(e) => setUserAnswer(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && checkAnswer()}
                                autoFocus
                              />
                              <span className="pattern-suffix">-{currentChallenge?.pattern.toUpperCase()}</span>
                            </div>
                          ) : (
                            <div className="pattern-input-container">
                              <span className="pattern-prefix">{currentChallenge?.pattern.toUpperCase()}-</span>
                              <input
                                type="text"
                                className="answer-input pattern-aware"
                                placeholder="Type the ending..."
                                value={userAnswer}
                                onChange={(e) => setUserAnswer(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && checkAnswer()}
                                autoFocus
                              />
                            </div>
                          )}
                        </div>
                        <div className="challenge-actions">
                          <button className="btn btn-primary" onClick={checkAnswer}>
                            Submit Word
                          </button>
                          <button className="btn btn-secondary" onClick={showAllWords}>
                            Show Words
                          </button>
                          <button className="btn btn-info" onClick={resetStudy}>
                            End Practice
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="answer-reveal">
                        <h4>You found {foundWords.size} out of {currentChallenge?.count} words!</h4>
                        <div className="words-grid">
                          {currentChallenge?.words.map((word, i) => {
                            const wasFound = foundWords.has(word.toLowerCase());
                            return (
                              <div
                                key={`${word}-${i}`}
                                className={`word-chip ${wasFound ? 'correct' : 'reveal'}`}
                              >
                                {wasFound ? '✓ ' : ''}{word}
                              </div>
                            );
                          })}
                        </div>
                        <div className="challenge-actions">
                          <button className="btn btn-info" onClick={nextChallenge}>
                            Next Challenge →
                          </button>
                          <button className="btn btn-secondary" onClick={resetStudy}>
                            End Practice
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
