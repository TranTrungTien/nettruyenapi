
import axios from "axios";
import axiosRetry from "axios-retry";
import { Cheerio, load } from "cheerio";
import { CookieJar } from "tough-cookie";
import { wrapper as axiosCookieJarSupport } from "axios-cookiejar-support";
import randomUserAgent from "random-useragent";
import { AxiosInstance } from "axios";
import { CheerioAPI } from "cheerio";

const MOBILE_UA_FALLBACKS = [
  "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

function getMobileUA(): string {
  const ua = randomUserAgent.getRandom(
    (u: any) => !!u && /Mobile|Android|iPhone/i.test(u)
  );
  return ua || MOBILE_UA_FALLBACKS[Math.floor(Math.random() * MOBILE_UA_FALLBACKS.length)];
}

export type Status = "all" | "completed" | "ongoing";

class ComicsApi {
  private domain: string;
  private axiosInstance: AxiosInstance;
  private cookieJar: CookieJar;

  constructor(domain = "https://truyenfull.vision") {
    this.domain = domain;
    this.cookieJar = new CookieJar();

    const inst = axios.create({
      timeout: 15000,
      headers: {
        "User-Agent": getMobileUA(),
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive",
      },
    });

    axiosCookieJarSupport(inst);
    (inst.defaults as any).jar = this.cookieJar;

    axiosRetry(inst, {
      retries: 3,
      retryDelay: (count) => count * 1000,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        [429, 502, 503, 504].includes(error.response?.status as number),
    });

    this.axiosInstance = inst;
  }

  private async randomDelay(min = 500, max = 1500): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Gửi request tới 1 path (VD: "truyen/one-piece")
   */
  public async createRequest(path: string): Promise<CheerioAPI> {
    const url = `${this.domain}/${path}`.replace(/\?+/g, "?");
    console.log("Fetching:", url);

    await this.randomDelay();

    try {
      const resp = await this.axiosInstance.get(url, {
        withCredentials: true,
        headers: {
          "User-Agent": getMobileUA(),
          "Referer": this.domain,
        },
      });
      return load(resp.data);
    } catch (err: any) {
      console.error("❌ Request failed:", err.message);
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

  private async getComics(path: string, page: number = 1): Promise<any> {
    try {
      const fullPath = `${path}${page > 1 ? `trang-${page}/` : ''}`;
      const $ = await this.createRequest(fullPath);

      // Try several pagination selectors; nếu không tìm thấy => 1
      let total_pages = 1;
      const pagHref = $(".col-truyen-main .pagination li:eq(-2) a").attr("href")
        || $(".paging a:last-child").attr("href")
        || $("ul.pagination li:last-child a").attr("href");
      if (pagHref) {
        const m = pagHref.match(/trang-(\d+)/) || pagHref.match(/page[=\/](\d+)/);
        total_pages = m ? Number(m[1]) : 1;
      }

      if (page > total_pages) {
        return { status: 404, message: "Page not found" };
      }

      const comics = Array.from($(".col-truyen-main .list-truyen .row")).map((item) => {
        const $item = $(item);

        // Title anchor
        const titleA = $item.find(".truyen-title a").first().length ? $item.find(".truyen-title a").first() : $item.find(".col-xs-7 a").first();
        const title = titleA && titleA.attr("title")
          ? this.trim(titleA.attr("title") ?? '')
          : this.trim(titleA.text() || "");
        const href = titleA && titleA.attr("href") ? titleA.attr("href") : "";
        const id = href ? this.getComicId(href) : "";

        // Thumbnail: data-image or data-desk-image on .lazyimg, or img src fallback
        const thumbDiv = $item.find(".lazyimg").first();
        const thumbnail = thumbDiv.attr("data-image") || thumbDiv.attr("data-desk-image") || thumbDiv.find("img").attr("src") || "";

        // Authors: remove icon text if present
        let authors = [];
        const authorEl = $item.find(".author").first();
        if (authorEl && authorEl.length) {
          // remove any child icons/text that aren't author name
          const cloned = authorEl.clone();
          cloned.find(".glyphicon").remove();
          authors.push(this.trim(cloned.text()) || "");
        }

        // Last chapter text and id
        const chapterA = $item.find(".text-info a").first().length ? $item.find(".text-info a").first() : $item.find(".col-xs-2 a").first();
        let last_chapter = "";
        let last_chapter_id = 0;
        if (chapterA && chapterA.length) {
          last_chapter = this.trim(chapterA.text()) || "";
          const chHref = chapterA.attr("href") || "";
          const chMatch = chHref.match(/chuong-(\d+)/) || chHref.match(/-(\d+)\/?$/);
          last_chapter_id = chMatch ? Number(chMatch[1]) : 0;
        }

        // Other optional fields — try to find, otherwise empty/defaults
        const updated_at = ""; // list page không có thời gian rõ ràng -> empty
        const total_views = ""; // không có
        const is_trending = $item.find(".label-title.label-hot").length > 0;
        const short_description = "";
        const lastest_chapters = last_chapter ? [{ name: last_chapter, id: last_chapter_id, updated_at }] : [];
        const genres: any = []; // không có trên list
        const other_names: any = [];
        const statusText = ""; // không có trạng thái rõ -> empty
        const total_comments = "";
        const followers = "";

        return {
          thumbnail,
          title,
          id,
          is_trending,
          short_description,
          lastest_chapters,
          genres,
          other_names,
          status: statusText,
          total_views,
          total_comments,
          followers,
          updated_at,
          authors,
        };
      });

      return { comics, total_pages, current_page: page };
    } catch (err) {
      throw err;
    }
  }

  public async getChapters(paramaters: { slug: string, chapterPage?: number }): Promise<any> {
    const { slug, chapterPage } = paramaters;
    try {
      const $ = await this.createRequest(`${slug}/trang-${chapterPage || 1}`);
      const chapters = Array.from($("#list-chapter .list-chapter li a")).map((chap) => {
        const href = $(chap).attr("href");
        const id = Number(href?.split("-")?.at(-1)?.replace("/", "")) || 0;
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

  public async getRecommendComics(): Promise<any> {
    try {
      return await this.getComics("danh-sach/truyen-hot/trang-1");
    } catch (err) {
      throw err;
    }
  }

  public async getRecentUpdateComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("/danh-sach/truyen-moi/", page);
    } catch (err) {
      throw err;
    }
  }

  public async getCompletedComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("/danh-sach/truyen-full/", page);
    } catch (err) {
      throw err;
    }
  }

  public async getComicsByGenre(genreId: string, page: number = 1): Promise<any> {
    try {
      const path = genreId === "all" ? "danh-sach/truyen-moi/" : `danh-sach/${genreId}/`;
      return await this.getComics(path, page);
    } catch (err) {
      throw err;
    }
  }

  public async getTrendingComics(page: number = 1): Promise<any> {
    try {
      return await this.getComics("danh-sach/truyen-hot/trang-2", page);
    } catch (err) {
      throw err;
    }
  }

  public async searchComics(query: string, page: number = 1): Promise<any> {
    try {
      return await this.getComics(`tim-kiem/?tukhoa=${query.replace(/\s+/g, "+")}&`, page);
    } catch (err) {
      throw err;
    }
  }

  public async getComicDetail(paramaters: { slug: string, id?: string, chapterPage?: number }): Promise<any> {
    const { slug } = paramaters;
    try {
      const [$, chapters] = await Promise.all([
        this.createRequest(`${slug}/`),
        this.getChapters(paramaters),
      ]);
      
      let total_chapter_pages = 1;
      const sencondLastestPage = $(".col-truyen-main #list-chapter .pagination li:eq(-2) a").attr("href");
      const lastestPage = $(".col-truyen-main #list-chapter .pagination li:eq(-1) a").attr("href");
      const pagHref = lastestPage?.includes('javascript:void(0)') ? sencondLastestPage : lastestPage;
      if (pagHref) {
        const m = pagHref.match(/trang-(\d+)/) || pagHref.match(/page[=\/](\d+)/);
        total_chapter_pages = m ? Number(m[1]) : 1;
      }
      
      const title = this.convertText($(".col-truyen-main .col-info-desc .title"));;
      const thumbnail = $(".col-truyen-main .books img").attr("src") || "";
      const description = this.convertText($(".col-truyen-main .desc-text"));
      const authors = Array.from($(".col-truyen-main .info div").filter((_: any, el: any) => $(el).text().includes("Tác giả"))).map((el) => $(el).find("a").text()).filter(Boolean) || "Updating";
      const status = $(".col-truyen-main .text-success")?.text()?.trim();
      const genres = Array.from($(".col-truyen-main .info div").filter((_: any, el: any) => $(el).text().includes("Thể loại")).find("a")).map((item) => {
        const id = this.getGenreId($(item).attr("href") ?? '');
        const name = $(item).text();
        return { id, name };
      });
      const is_adult = false; // Fix tạm
      const other_names: any = []; // Fix tạm
      const total_views = this.formatTotal($(".col-truyen-main .info div").filter((i: any, el: any) => $(el).text().includes("Lượt xem")).find("span").text());
      const rating_count = Number($(".col-truyen-main .rate-holder").attr("data-score")) || 0; // Fix tạm
      const average = Number($(".col-truyen-main .small span:last-child").text()) || 0;
      const followers = "Updating"; // No followers
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
        id: slug,
        is_adult,
        other_names,
        total_chapter_pages,
      };
    } catch (err) {
      throw err;
    }
  }

  private convertText(element: Cheerio<any>): string {
    if(!element) return '';

    return element.html()?.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim() || ''
  }

  public async getChapterContent(paramaters: { slug: string, id: string, chapterPage?: number }): Promise<any> {
    const { slug, id } = paramaters;
    try {
      const [$, chapters] = await Promise.all([
        this.createRequest(`${slug}/chuong-${id}/`),
        this.getChapters(paramaters),
      ]);
      const chapter_name = $("#chapter-big-container .chapter-title").text().trim();
      const comic_name = $("#chapter-big-container .truyen-title").text().trim();
      const content = this.convertText($('#chapter-c'));

      return { chapter_name, comic_name, content, chapters };
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
}

const Comics = new ComicsApi();
export { Comics };