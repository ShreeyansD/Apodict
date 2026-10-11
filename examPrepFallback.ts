import zlib from 'zlib';

export interface PracticeQuestion {
  id: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface StudyGuideSection {
  heading: string;
  summary: string;
  bulletPoints: string[];
}

export interface StudyGuideData {
  overview: string;
  likelyTopics: string[];
  keyTerms: KeyTerm[];
  sections: StudyGuideSection[];
}

export interface ExamPrepFallbackResult {
  mode: 'questions' | 'guide';
  notesTooThin: boolean;
  notesFeedback: string | null;
  questions: PracticeQuestion[];
  studyGuide: StudyGuideData | null;
  generatedAt: string;
}

/**
 * Extracts raw readable text from a base64-encoded PDF document without external binaries.
 */
export function extractTextFromPdfBase64(base64Data: string): string {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const textPieces: string[] = [];

    // 1. Scan for FlateDecode streams and decompress them
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    const rawString = buffer.toString('latin1');
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(rawString)) !== null) {
      const streamBytes = Buffer.from(match[1], 'latin1');
      try {
        const decompressed = zlib.inflateSync(streamBytes).toString('utf-8');
        // Extract text within BT ... ET blocks and Tj / TJ operators
        const tjMatches = decompressed.match(/\((.*?)\)\s*Tj/g);
        if (tjMatches) {
          for (const m of tjMatches) {
            const inner = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
            if (inner.trim().length > 1) {
              textPieces.push(inner.replace(/\\([()\\])/g, '$1'));
            }
          }
        }
        // Also extract array TJ operators: [(...) 10 (...)] TJ
        const tjArrayMatches = decompressed.match(/\[(.*?)\]\s*TJ/g);
        if (tjArrayMatches) {
          for (const arr of tjArrayMatches) {
            const parts = arr.match(/\((.*?)\)/g);
            if (parts) {
              const joined = parts.map((p) => p.slice(1, -1)).join(' ');
              if (joined.trim().length > 1) {
                textPieces.push(joined);
              }
            }
          }
        }
      } catch {
        // Not a zlib stream or corrupt, continue
      }
    }

    // 2. If compressed stream extraction found text, return it
    if (textPieces.length > 5) {
      return textPieces.join(' ').replace(/\s+/g, ' ').trim();
    }

    // 3. Fallback: extract printable ASCII words directly from raw latin1 string
    const printableWords = rawString.match(/[a-zA-Z0-9_\-\.\:\,\;]{3,}/g);
    if (printableWords && printableWords.length > 20) {
      return printableWords.filter((w) => !w.startsWith('/') && !w.startsWith('obj') && !w.startsWith('endobj')).join(' ');
    }

    return '';
  } catch (err) {
    return '';
  }
}

/**
 * Extracts concepts, terms, definitions, and sentences from student notes.
 */
function parseStudyMaterials(text: string): {
  terms: Array<{ term: string; definition: string }>;
  sentences: string[];
  paragraphs: string[];
} {
  const clean = text.replace(/\r\n/g, '\n').trim();
  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);

  const rawLines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const terms: Array<{ term: string; definition: string }> = [];
  const seenTerms = new Set<string>();

  for (const line of rawLines) {
    // Look for definitions like "Term: Definition" or "Term - Definition" or "- Term: Definition"
    const cleanedLine = line.replace(/^[\*\-\•\d+\.]\s*/, '').trim();

    // Match "Term: definition" or "Term - definition"
    const colonMatch = cleanedLine.match(/^([A-Za-z0-9\s\(\)\/\-]{3,40})\s*[:\-\u2013\u2014]\s+(.+)$/);
    if (colonMatch) {
      const term = colonMatch[1].trim();
      const def = colonMatch[2].trim();
      if (term.length >= 3 && term.length <= 45 && def.length >= 10 && !seenTerms.has(term.toLowerCase())) {
        seenTerms.add(term.toLowerCase());
        terms.push({ term, definition: def });
        continue;
      }
    }

    // Match "Term is/refers to/means definition"
    const isMatch = cleanedLine.match(/^([A-Z][a-zA-Z0-9\s]{2,35})\s+(?:is|refers to|means|represents)\s+(.+)$/);
    if (isMatch) {
      const term = isMatch[1].trim();
      const def = cleanedLine.trim();
      if (term.length >= 3 && term.length <= 40 && def.length >= 15 && !seenTerms.has(term.toLowerCase())) {
        seenTerms.add(term.toLowerCase());
        terms.push({ term, definition: def });
      }
    }
  }

  // Extract sentences
  const sentences = clean
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 250);

  return { terms, sentences, paragraphs };
}

/**
 * Generates an ExamPrep result deterministically based solely on the student's study materials.
 */
export function generateFallbackExamPrep(params: {
  courseName: string;
  examTitle: string;
  examDate?: string | null;
  mode: 'questions' | 'guide';
  notes?: string;
  extractedText?: string;
  pdfFiles?: Array<{ name: string; base64?: string; size?: number; extractedText?: string }>;
  questionCount?: number;
  questionMix?: 'mixed' | 'multiple_choice' | 'short_answer';
}): ExamPrepFallbackResult {
  const {
    courseName = 'Course',
    examTitle = 'Exam',
    examDate = '',
    mode = 'questions',
    notes = '',
    extractedText = '',
    pdfFiles = [],
    questionCount = 10,
    questionMix = 'mixed',
  } = params;

  // Aggregate all notes and PDF text
  let combinedText = (notes || '').trim();
  if (extractedText && typeof extractedText === 'string' && extractedText.trim()) {
    combinedText += (combinedText ? '\n\n' : '') + extractedText.trim();
  }
  if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
    for (const pdf of pdfFiles) {
      if (pdf.extractedText) {
        combinedText += `\n\n--- [Document: ${pdf.name}] ---\n` + pdf.extractedText;
      } else if (pdf.base64) {
        const extracted = extractTextFromPdfBase64(pdf.base64);
        if (extracted) {
          combinedText += `\n\n--- [Uploaded Document: ${pdf.name}] ---\n` + extracted;
        }
      }
    }
  }

  combinedText = combinedText.trim();

  // Thin check
  const words = combinedText.split(/\s+/).filter(Boolean);
  if (combinedText.length < 25 || words.length < 6) {
    return {
      mode,
      notesTooThin: true,
      notesFeedback:
        'Your pasted notes and uploaded document do not contain enough academic text to generate prep. Please paste lecture notes, study outlines, or key concepts.',
      questions: [],
      studyGuide: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const { terms, sentences, paragraphs } = parseStudyMaterials(combinedText);
  const targetCount = Math.min(15, Math.max(5, Number(questionCount) || 10));

  // Build key terms if none explicitly matched
  const effectiveTerms: Array<{ term: string; definition: string }> = [...terms];
  if (effectiveTerms.length < 4) {
    // Extract capitalized words or noun phrases from sentences
    const candidateKeywords = combinedText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
    const uniqueKeywords = Array.from(new Set(candidateKeywords)).filter(
      (w) => w.length > 3 && !['Exam', 'Midterm', 'Final', 'Course', 'Week', 'Chapter', 'Page', 'Date'].includes(w)
    );

    for (const kw of uniqueKeywords.slice(0, 8)) {
      const matchingSentence = sentences.find((s) => s.includes(kw));
      if (matchingSentence && !effectiveTerms.some((t) => t.term.toLowerCase() === kw.toLowerCase())) {
        effectiveTerms.push({
          term: kw,
          definition: matchingSentence,
        });
      }
    }
  }

  // Ensure at least some terms exist
  if (effectiveTerms.length === 0) {
    for (let i = 0; i < Math.min(sentences.length, 6); i++) {
      const wordsInSentence = sentences[i].split(/\s+/);
      const head = wordsInSentence.slice(0, 3).join(' ');
      effectiveTerms.push({
        term: head || `Core Concept ${i + 1}`,
        definition: sentences[i],
      });
    }
  }

  if (mode === 'questions') {
    const questions: PracticeQuestion[] = [];
    const numMc =
      questionMix === 'multiple_choice'
        ? targetCount
        : questionMix === 'short_answer'
        ? 0
        : Math.ceil(targetCount / 2);
    const numSa = targetCount - numMc;

    // Distractor pool
    const distractorPool = effectiveTerms.map((t) => t.definition);
    if (distractorPool.length < 4) {
      sentences.forEach((s) => distractorPool.push(s));
    }

    // 1. Generate Multiple Choice Questions
    for (let i = 0; i < numMc; i++) {
      const termObj = effectiveTerms[i % effectiveTerms.length];
      const correctDef = termObj.definition;

      // Pick 3 strictly unique distractors
      const uniqueOtherDefs = Array.from(
        new Set(distractorPool.filter((d) => d.trim().toLowerCase() !== correctDef.trim().toLowerCase()))
      );
      const chosenDistractors: string[] = [];
      const genericFallbacks = [
        `A secondary variant that trades space complexity for amortized lookup guarantees.`,
        `The inverse concept where structural ordering constraints are inverted.`,
        `An alternative formulation that applies only under restricted edge conditions.`,
        `A static configuration where dynamic runtime updates are disallowed.`,
      ];

      const usedInQuestion = new Set<string>([correctDef.trim().toLowerCase()]);
      let poolIdx = (i * 3) % (uniqueOtherDefs.length || 1);

      for (let d = 0; d < 3; d++) {
        let candidate = '';
        while (poolIdx < uniqueOtherDefs.length && !candidate) {
          const item = uniqueOtherDefs[poolIdx];
          poolIdx++;
          if (!usedInQuestion.has(item.trim().toLowerCase())) {
            candidate = item;
          }
        }
        if (!candidate) {
          candidate = genericFallbacks[d % genericFallbacks.length];
        }
        usedInQuestion.add(candidate.trim().toLowerCase());
        chosenDistractors.push(candidate.length > 120 ? candidate.slice(0, 117) + '...' : candidate);
      }

      const cleanCorrect = correctDef.length > 120 ? correctDef.slice(0, 117) + '...' : correctDef;
      const allOptions = [cleanCorrect, ...chosenDistractors];

      // Shuffle options deterministically
      const correctIndex = (i * 3 + 1) % 4;
      const shuffledOptions: string[] = [];
      const letters = ['A', 'B', 'C', 'D'];

      let distractorIdx = 1;
      for (let optIdx = 0; optIdx < 4; optIdx++) {
        if (optIdx === correctIndex) {
          shuffledOptions.push(`${letters[optIdx]}) ${allOptions[0]}`);
        } else {
          shuffledOptions.push(`${letters[optIdx]}) ${allOptions[distractorIdx] || 'None of the above'}`);
          distractorIdx++;
        }
      }

      const correctLetter = letters[correctIndex];
      const correctText = shuffledOptions[correctIndex];

      questions.push({
        id: `q${i + 1}`,
        type: 'multiple_choice',
        question: `In ${courseName}, which of the following statements most accurately describes "${termObj.term}"?`,
        options: shuffledOptions,
        correctAnswer: correctText,
        explanation: `According to your study materials, ${termObj.term} is defined as: "${termObj.definition}".`,
      });
    }

    // 2. Generate Short Answer Questions
    for (let i = 0; i < numSa; i++) {
      const idx = (numMc + i) % (sentences.length || effectiveTerms.length || 1);
      const sentence = sentences[idx] || effectiveTerms[idx % effectiveTerms.length]?.definition || 'Review the core topics from lecture.';
      const relatedTerm = effectiveTerms[i % effectiveTerms.length]?.term || `Key Concept ${i + 1}`;

      questions.push({
        id: `q${numMc + i + 1}`,
        type: 'short_answer',
        question: `Explain the importance of ${relatedTerm} as covered in your ${courseName} notes, and summarize its primary function or application.`,
        options: [],
        correctAnswer: sentence.length > 200 ? sentence.slice(0, 197) + '...' : sentence,
        explanation: `Key point from materials: "${sentence}". Highlighting this core mechanism demonstrates mastery on ${examTitle}.`,
      });
    }

    return {
      mode: 'questions',
      notesTooThin: false,
      notesFeedback: null,
      questions,
      studyGuide: null,
      generatedAt: new Date().toISOString(),
    };
  }

  // Study Guide Mode
  const likelyTopics: string[] = [];
  const sections: StudyGuideSection[] = [];

  // Group terms into 3-4 sections
  const numSections = Math.min(4, Math.max(2, Math.ceil(effectiveTerms.length / 3)));
  const termsPerSection = Math.ceil(effectiveTerms.length / numSections);

  for (let sIdx = 0; sIdx < numSections; sIdx++) {
    const sectionTerms = effectiveTerms.slice(sIdx * termsPerSection, (sIdx + 1) * termsPerSection);
    const mainTerm = sectionTerms[0]?.term || `Core Subject ${sIdx + 1}`;
    const heading = `${sIdx + 1}. Fundamentals of ${mainTerm}`;
    likelyTopics.push(mainTerm);

    const bullets: string[] = [];
    sectionTerms.forEach((t) => {
      bullets.push(`**${t.term}**: ${t.definition}`);
    });

    if (bullets.length < 3 && sentences.length > sIdx) {
      bullets.push(sentences[sIdx]);
    }

    sections.push({
      heading,
      summary: `This section focuses on ${mainTerm} and surrounding principles required for ${examTitle}. Mastery of these definitions is essential for success.`,
      bulletPoints: bullets,
    });
  }

  const overview = `Comprehensive exam review synthesized for ${courseName}: ${examTitle}${
    examDate ? ` (scheduled for ${examDate})` : ''
  }. This study guide organizes essential definitions, analytical frameworks, and core concepts directly from your uploaded materials to maximize retention.`;

  return {
    mode: 'guide',
    notesTooThin: false,
    notesFeedback: null,
    questions: [],
    studyGuide: {
      overview,
      likelyTopics: likelyTopics.slice(0, 5),
      keyTerms: effectiveTerms.slice(0, 8),
      sections,
    },
    generatedAt: new Date().toISOString(),
  };
}
