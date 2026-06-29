export interface HhVacancy {
  id: string;
  title: string;
  companyName: string | null;
  alternateUrl: string | null;
  descriptionHtml: string;
  keySkills: string[];
}

export interface HhClient {
  getVacancy(id: string): Promise<HhVacancy>;
}
