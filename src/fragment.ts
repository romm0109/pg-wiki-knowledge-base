export interface Fragment {
  text: string;
  charOffsetStart: number;
  charOffsetEnd: number;
}

export function fragmentContent(
  content: string,
  chunkSize = 1000,
  chunkOverlap = 200
): Fragment[] {
  if (content.length <= chunkSize) {
    return [
      {
        text: content,
        charOffsetStart: 0,
        charOffsetEnd: content.length,
      },
    ];
  }

  const fragments: Fragment[] = [];
  const step = Math.max(1, chunkSize - chunkOverlap);

  for (let start = 0; start < content.length; start += step) {
    const end = Math.min(content.length, start + chunkSize);

    fragments.push({
      text: content.slice(start, end),
      charOffsetStart: start,
      charOffsetEnd: end,
    });

    if (end >= content.length) {
      break;
    }
  }

  return fragments;
}
