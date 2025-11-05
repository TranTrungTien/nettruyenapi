import crypto from 'crypto';
import axios from "axios";
import { load } from "cheerio";
import userAgent from "random-useragent";
// Hàm sinh token (giả định dựa trên ngày, cần reverse-engineer)
export const generateToken = (): string => {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return crypto.createHash('md5').update(date).digest('hex'); // Cập nhật logic thực tế
};

export type Status = "all" | "completed" | "ongoing";

class ComicsApi {
  private domain: string;
  private agent: string;
  constructor() {
    this.domain = 'https://truyenfull.vision';
    this.agent = userAgent.getRandom();
  }

  private async createRequest(path: string): Promise<any> {
    console.log(`${this.domain}/${path}`);
    
    try {
      const { data } = await axios.request({
        method: "GET",
        url: `${this.domain}/${path}`.replace(/\?+/g, "?"),
        headers: { "User-Agent": this.agent },
      });
      return load(data);
    } catch (err) {
      throw err;
    }
  }

  private getComicId(link?: string): string | undefined {
    if (!link) return "";
    return link.split("/").at(-2) || ""; // Adjusted for truyenfull slug
  }

  private getGenreId(link: string): string | undefined {
    if (!link) return "";
    return link.split("/").at(-2) || "";
  }

  private formatTotal(total: string): number | string {
    if (!total) return 0;
    return total === "N/A" ? "Updating" : Number(total?.replace(/\./g, "").replace(/,/g, ""));
  }

  private trim(text: string): string | undefined {
    return text?.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  }

  private compactNumber(total: number) {
    return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(total);
  }

  private async getComics(path: string, page: number = 1, statusKey: Status = "all"): Promise<any> {
    const status: any = {
      all: -1,
      ongoing: 1,
      completed: 2,
    };

    if (!status[statusKey]) throw Error("Invalid status");

    try {
      const fullPath = `${path}${page > 1 ? `trang-${page}/` : ''}`;
      const $ = await this.createRequest(fullPath);

      const total_pages = Number($(".pagination li:nth-last-child(2) a").attr("href")?.match(/trang-(\d+)/)?.[1] || 1);

      if (page > total_pages) {
        return { status: 404, message: "Page not found" };
      }
      

      const comics = Array.from($(".col-truyen-main .list.list-truyen .row")).map((item, index) => {
        const $item = $(item);
    
        // === Title & ID ===
        const title_a = $item.find(".col-xs-7 a");
        const title = title_a.attr("title")?.trim() || title_a.text().trim();
        const id = this.getComicId(title_a.attr("href"));
      
        // === Author ===
        const authors = $item.find(".col-xs-7 .author").text().trim() || "Updating";
      
        // === Last Chapter ===
        const chapter_a = $item.find(".col-xs-2.text-info a");
        const last_chapter = chapter_a.text().trim() || "Updating";
        const chapter_id = Number(
          chapter_a.attr("href")?.split("-")?.at(-1)?.replace("/", "")
        ) || 0;
      
        // === Thumbnail (lazyimg div) ===
        const img_div = $item.find(".col-xs-3 .lazyimg");
        const thumbnail =
          img_div.attr("data-desk-image") ||
          img_div.attr("data-image") ||
          "";
        const alt =
          img_div.attr("data-alt") ||
          title;
      
        // === Extra Info (not in list, placeholders) ===
        const updated_at = "Updating";
        const total_views = "Updating";
        const total_comments = "Updating";
        const followers = "Updating";
        const short_description = "";
        const genres: any = [];
        const other_names: any = [];
        const status = "Updating";
        const is_trending = false;
      
        // === Chapter list ===
        const lastest_chapters = [
          { name: last_chapter, id: chapter_id, updated_at },
        ];
      
        return {
          title,
          id,
          thumbnail,
          alt,
          authors,
          lastest_chapters,
          genres,
          other_names,
          status,
          total_views,
          total_comments,
          followers,
          updated_at,
          short_description,
          is_trending,
        };
      });
      
      return { comics, total_pages, current_page: page };
    } catch (err) {
      throw err;
    }
  }

  public async getChapters(comicId: string): Promise<any> {
    try {
      const $ = await this.createRequest(comicId);
      const chapters = Array.from($(".list-chapter li a")).map((chap) => {
        const href = $(chap).attr("href");
        const id = Number(href.split("-").at(-1).replace("/", "")) || 0;
        const name = $(chap).attr("title") || $(chap).text();
        return { id, name };
      });
      return chapters;
    } catch (err) {
      throw err;
    }
  }

  public async getGenres(): Promise<any> {
    try {
      const $ = await this.createRequest("");
      const genres = Array.from($(".navbar-nav li.dropdown:contains('Danh sách') .dropdown-menu a")).map((item) => {
        const href = $(item).attr("href") || "";
        const id = this.getGenreId(href);
        const name = this.trim($(item).text()) || "";
        const description = $(item).attr("title") || "";
        return { id, name, description };
      });
      return genres;
    } catch (err) {
      throw err;
    }
  }

  public async getRecommendComics(type: "hot" | "boy" | "girl" = "hot"): Promise<any> {
    const keys = {
      hot: "",
      boy: "truyen-con-trai",
      girl: "truyen-con-gai",
    };
    const $ = await this.createRequest(keys[type]);
    const comics = Array.from($(".index-intro").children()).map((item: any) => {
      const a = $("a", item);
      const id = this.getComicId(a.attr("href"));
      const title = a.attr("title") || this.trim(a.text());
      
      const thumbnail = $("img", item).attr("src") || "";
      const updated_at = "Updating";
      const chapter_id = 0;
      const name = "Updating";
      return { id, title, thumbnail, updated_at, lastest_chapter: { id: chapter_id, name } };
    });
    return comics;
  }

  public async getRecentUpdateComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("", page);
    } catch (err) {
      throw err;
    }
  }

  public async getCompletedComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("truyen-da-hoan-thanh/", page, "completed");
    } catch (err) {
      throw err;
    }
  }

  public async getNewComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("danh-sach/truyen-moi/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getComicsByGenre(genreId: string, page: number = 1): Promise<any> {
    try {
      const path = genreId === "all" ? "danh-sach/truyen-moi/" : `danh-sach/${genreId}/`;
      const fullPath = `${path}${page > 1 ? `trang-${page}/` : ''}`;
      const $ = await this.createRequest(fullPath);
  
      const total_pages = Number($(".pagination li:nth-last-child(2) a").attr("href")?.match(/trang-(\d+)/)?.[1] || 1);

      
      const comics = Array.from($(".col-truyen-main .list.list-truyen .row")).map((item, index) => {
        const $item = $(item);
    
        // === Title & ID ===
        const title_a = $item.find(".col-xs-7 a");
        const title = title_a.attr("title")?.trim() || title_a.text().trim();
        const id = this.getComicId(title_a.attr("href"));
      
        // === Author ===
        const authors = $item.find(".col-xs-7 .author").text().trim() || "Updating";
      
        // === Last Chapter ===
        const chapter_a = $item.find(".col-xs-2.text-info a");
        const last_chapter = chapter_a.text().trim() || "Updating";
        const chapter_id = Number(
          chapter_a.attr("href")?.split("-")?.at(-1)?.replace("/", "")
        ) || 0;
      
        // === Thumbnail (lazyimg div) ===
        const img_div = $item.find(".col-xs-3 .lazyimg");
        const thumbnail =
          img_div.attr("data-desk-image") ||
          img_div.attr("data-image") ||
          "";
        const alt =
          img_div.attr("data-alt") ||
          title;
      
        // === Extra Info (not in list, placeholders) ===
        const updated_at = "Updating";
        const total_views = "Updating";
        const total_comments = "Updating";
        const followers = "Updating";
        const short_description = "";
        const genres: any = [];
        const other_names: any = [];
        const status = "Updating";
        const is_trending = false;
      
        // === Chapter list ===
        const lastest_chapters = [
          { name: last_chapter, id: chapter_id, updated_at },
        ];
      
        return {
          title,
          id,
          thumbnail,
          alt,
          authors,
          lastest_chapters,
          genres,
          other_names,
          status,
          total_views,
          total_comments,
          followers,
          updated_at,
          short_description,
          is_trending,
        };
      });
  
      return { comics, total_pages, current_page: page };
    } catch (err) {
      throw err;
    }
  }

  public async getTopDailyComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/ngay/", page, status); // Fix tạm for top
    } catch (err) {
      throw err;
    }
  }

  public async getTopWeeklyComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/tuan/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTopMonthlyComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/thang/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTopFollowComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/theo-doi/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTopCommentComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/binh-luan/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTopAllComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTopChapterComics(status: Status = "all", page: number = 1): Promise<any> {
    try {
      return await this.getComics("bang-xep-hang/so-chuong/", page, status);
    } catch (err) {
      throw err;
    }
  }

  public async getTrendingComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("truyen-hot/", page);
    } catch (err) {
      throw err;
    }
  }

  public async getBoyComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("truyen-con-trai/", page);
    } catch (err) {
      throw err;
    }
  }

  public async getGirlComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("truyen-con-gai/", page);
    } catch (err) {
      throw err;
    }
  }

  public async searchComics(query: string, page: number = 1): Promise<any> {
    try {
      const encodedQuery = encodeURIComponent(query.trim()).replace(/%20/g, "+");
      const path = `tim-kiem/?tukhoa=${encodedQuery}`;
      const fullPath = `${path}&page=${page}`;
      const $ = await this.createRequest(fullPath);
  
      const total_pages = Number($(".pagination li:nth-last-child(2) a").attr("href")?.match(/page=(\d+)/)?.[1] || 1);
      const comics = Array.from($(".col-truyen-main .list.list-truyen .row")).map((item, index) => {
        const $item = $(item);
        if(index === 38) console.log($item.html());
        
        // === Title & ID ===
        const title_a = $item.find(".col-xs-7 a");
        const title = title_a.attr("title")?.trim() || title_a.text().trim();
        const id = this.getComicId(title_a.attr("href"));
      
        // === Author ===
        const authors = $item.find(".col-xs-7 .author").text().trim() || "Updating";
      
        // === Last Chapter ===
        const chapter_a = $item.find(".col-xs-2.text-info a");
        const last_chapter = chapter_a.text().trim() || "Updating";
        const chapter_id = Number(
          chapter_a.attr("href")?.split("-")?.at(-1)?.replace("/", "")
        ) || 0;
      
        // === Thumbnail (lazyimg div) ===
        const img_div = $item.find(".col-xs-3 .lazyimg");
        const thumbnail =
          img_div.attr("data-desk-image") ||
          img_div.attr("data-image") ||
          "";
        const alt =
          img_div.attr("data-alt") ||
          title;
      
        // === Extra Info (not in list, placeholders) ===
        const updated_at = "Updating";
        const total_views = "Updating";
        const total_comments = "Updating";
        const followers = "Updating";
        const short_description = "";
        const genres: any = [];
        const other_names: any = [];
        const status = "Updating";
        const is_trending = false;
      
        // === Chapter list ===
        const lastest_chapters = [
          { name: last_chapter, id: chapter_id, updated_at },
        ];
      
        return {
          title,
          id,
          thumbnail,
          alt,
          authors,
          lastest_chapters,
          genres,
          other_names,
          status,
          total_views,
          total_comments,
          followers,
          updated_at,
          short_description,
          is_trending,
        };
      });
  
      return { comics, total_pages, current_page: page };
    } catch (err) {
      throw err;
    }
  }

  public async getComicDetail(comicId: string): Promise<any> {
    try {
      const [$, chapters] = await Promise.all([
        this.createRequest(`${comicId}/`),
        this.getChapters(comicId),
      ]);
      const title = $(".truyen-title").text().trim();
      const thumbnail = $(".books img").attr("src") || "";
      const description = $(".desc-text").text().trim();
      const authors = Array.from($(".info div").filter((_: any, el: any) => $(el).text().includes("Tác giả"))).map((el) => $(el).find("a").text()).filter(Boolean) || "Updating";
      const status = $(".info div").filter((_: any, el: any) => $(el).text().includes("Tình trạng")).find("span").text() === "Hoàn thành" ? "Finished" : "Ongoing";
      const genres = Array.from($(".info div").filter((_: any, el: any) => $(el).text().includes("Thể loại")).find("a")).map((item) => {
        const id = this.getGenreId($(item).attr("href"));
        const name = $(item).text();
        return { id, name };
      });
      const is_adult = false; // Fix tạm
      const other_names: any = []; // Fix tạm
      const total_views = this.formatTotal($(".info div").filter((i: any, el: any) => $(el).text().includes("Lượt xem")).find("span").text());
      const rating_count = Number($(".rate-holder").attr("data-score")) || 0; // Fix tạm
      const average = Number($(".small span:last-child").text()) || 0;
      const followers = "Updating"; // No followers
      const total_pages = Number($(".pagination li:nth-last-child(2) a").attr("href")?.match(/trang-(\d+)/)?.[1] || 1);
      
      return {
        title,
        thumbnail,
        description,
        authors,
        status,
        genres,
        total_views,
        average,
        rating_count,
        followers,
        chapters,
        id: comicId,
        is_adult,
        other_names,
        total_pages
      };
    } catch (err) {
      throw err;
    }
  }

  public async getChapter(comicId: string, chapterId: number): Promise<any> {
    try {
      const [$, chapters] = await Promise.all([
        this.createRequest(`${comicId}/chuong-${chapterId}/`),
        this.getChapters(comicId),
      ]);
      const images: any = []; // No images in novel chapter
      const chapter_name = $(".chapter-title").text().trim();
      const comic_name = $(".truyen-title a").text().trim();
      const content = $("#chapter-c").text().trim();
      return { images, chapters, chapter_name, comic_name, content };
    } catch (err) {
      throw err;
    }
  }

  public async getComicsByAuthor(alias: string) {
    try {
      return this.getComics(`tac-gia/${alias}/`);
    } catch (err) {
      throw err;
    }
  }

  public async getComments(comicId: string, page: number = 1): Promise<any> {
    try {
      // Fix tạm, vì không có API comment
      return { comments: [], total_comments: 0, total_pages: 1, current_page: page };
    } catch (err) {
      throw err;
    }
  }

  public async getSearchSuggest(query: string): Promise<any> {
    try {
      // Fix tạm, vì không có suggest API
      return [];
    } catch (err) {
      throw err;
    }
  }
}

const Comics = new ComicsApi();
export { Comics };
