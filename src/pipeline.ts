export function parseBlocklist(data: string): {reporter: string; cheater: string}[] {
  return data
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [reporter, reported] = line.split(" ");
      return {
        reporter: reporter.toLowerCase(),
        cheater: reported.toLowerCase(),
      };
    });
}
