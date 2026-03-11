interface BingoGridProps {
  drawnNumbers: number[];
  superNumber?: number;
  previousNumbers?: number[];
}

export function BingoGrid({ drawnNumbers, superNumber, previousNumbers = [] }: BingoGridProps) {
  const cells = Array.from({ length: 80 }, (_, i) => i + 1);

  return (
    <div className="bingo-grid">
      {cells.map((num) => {
        const isDrawn = drawnNumbers.includes(num);
        const isSuper = num === superNumber;
        const isBig = num >= 41;
        const isSerial = isDrawn && previousNumbers.includes(num);

        let className = 'bingo-grid-cell';
        if (isSuper) {
          className += ' super';
        } else if (isDrawn) {
          className += isBig ? ' drawn-big' : ' drawn-small';
        }
        
        if (isSerial) {
            className += ' serial';
        }

        return (
          <div key={num} className={className}>
            {num}
            {isSerial && <span className="serial-badge">🔁</span>}
          </div>
        );
      })}
    </div>
  );
}
