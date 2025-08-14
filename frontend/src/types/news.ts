export interface Article {
  id:string; title:string; summary?:string; url:string;
  source:string; publishedAt:string; language?:string;
}
export interface NewsResponse { ok:boolean; articles:Article[]; nextPage?:number|null; }