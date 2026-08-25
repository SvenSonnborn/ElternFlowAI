export interface Parent {
  name: string;
  short: string;
  email: string;
  color: string;
}

export interface Child {
  id: string;
  name: string;
  age: number;
  color: string;
  school: string;
  grade: string;
  birthday: string;
  allergies: string[];
  likes: string[];
  dislikes: string[];
}
