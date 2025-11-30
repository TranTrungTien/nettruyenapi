
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

class SSStoryApi {
    private domain?: string;
    private axiosInstance: AxiosInstance;
    private cookieJar: CookieJar;

    constructor() {
        this.domain = process.env.BASE_URL_V3;
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

    public async createRequest(path?: string, shouldReturnRawData = false): Promise<any> {
        const url = `${this.domain}/${path}`.replace(/\?+/g, "?");
        console.log("Fetching:", url);

        await this.randomDelay();

        try {
            const resp = await this.axiosInstance.get(url, {
                withCredentials: true,
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": getMobileUA(),
                    "Referer": this.domain,
                },
            });

            if (shouldReturnRawData) return resp.data;

            return load(resp.data);
        } catch (err: any) {
            console.error("❌ Request failed:", err.message);
            throw err;
        }
    }

    private getDefaultText(value?: string): string {
        if (value) return value;
        return 'Đang cập nhật';
    }

    private convertText(element: Cheerio<any>): string {
        if (!element) return '';

        let htmlContent = element.html();
        if (!htmlContent) return '';

        htmlContent = htmlContent
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/li>/gi, '\n');

        htmlContent = htmlContent
            .replace(/&nbsp;/gi, ' ')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&');

        htmlContent = htmlContent.replace(/<[^>]+>/g, '');
        return htmlContent.trim();
    }

    private convertHrefToId(value: string, position: number = 1): string {
        return value?.split('/')?.[position] ?? ''
    }

    private async getBookIdFromSlug(slug: string): Promise<string> {
        const html = await this.createRequest(`${slug}/`);
        const $ = html;

        const scripts = $('script').map((_: any, el: any) => $(el).html() || '').get().join('\n');
        const ridMatch = scripts.match(/var\s+rid\s*=\s*['"](\d+)['"]/i);
        if (ridMatch) {
            return ridMatch[1]; // ← trả về 87633
        }

        const onclickStr = $('.paging a').attr('onclick') || '';
        const onclickMatch = onclickStr.match(/page\(\s*['"]?(\d+)['"]?\s*,/);
        if (onclickMatch) {
            return onclickMatch[1];
        }

        const inputBid = $('input[name="bid"]').val();
        if (inputBid && /^\d+$/.test(inputBid as string)) {
            return inputBid as string;
        }

        throw new Error(`Không tìm thấy bookId cho slug: ${slug}`);
    }

    private async getStories(path: string, page: number = 1, isCompletedPath = false): Promise<any> {
        try {
            const fullPath = isCompletedPath ? path : `${path}${page > 1 ? `?page=${page}` : ''}`;
            const $ = await this.createRequest(fullPath) as CheerioAPI;

            let totalPages = 1;
            const pageLinks = $(".phan-trang a.btn-page");
            if (pageLinks.length > 0) {
                const maxPage = pageLinks
                    .map((_, el) => {
                        const href = $(el).attr("href") || "";
                        const text = $(el).text().trim();
                        const hrefMatch = href.match(/\?page=(\d+)/);
                        return hrefMatch ? Number(hrefMatch[1]) : (text.match(/\d+/) ? Number(text) : 0);
                    })
                    .get()
                    .filter(n => n > 0);
                totalPages = maxPage.length > 0 ? Math.max(...maxPage) : 1;
            }

            const hasMorePages = totalPages > 1 || $(".phan-trang a:contains('❭')").length > 0;

            if (page > totalPages) {
                return { status: 404, message: "Page not found" };
            }

            const comics = Array.from($(".container .main-wrapper .truyen-list .item")).map((item) => {
                const $item = $(item);

                const titleA = $item.find("h3 a").first();
                const title = this.getDefaultText(titleA.text());
                const href = titleA.attr("href") || "";
                const id = this.convertHrefToId(href, 1);

                const thumbnail = $item.find(".cover img").attr("src") || "";
                const fullThumbnail = thumbnail.startsWith("http") ? thumbnail : `${this.domain}${thumbnail}`;

                const authors = $item.find("p.line:contains('Tác giả') a")
                    .map((_, el) => {
                        const name = this.getDefaultText($(el).text());
                        return name;
                    })
                    .get();

                const genres = $item.find("p.line:contains('Thể loại') a")
                    .map((_, el) => {
                        const name = this.getDefaultText($(el).text());
                        const href = $(el).attr("href") || "";
                        const id = this.convertHrefToId(href, 2);
                        return { id, name };
                    })
                    .get();

                const statusElem = $item.find("h3 i.status");
                const status = statusElem.hasClass("status-full") ? "Full" : this.getDefaultText();

                const chapterText = $item.find("p.line:contains('Số chương')").text();
                const totalChapters = chapterText.match(/(\d+)/) ? Number(RegExp.$1) : 0;

                const lastestChapters: any[] = [];

                const updatedAt = this.getDefaultText();
                const totalViews = this.getDefaultText();
                const isTrending = false;
                const shortDescription = this.getDefaultText();
                const totalComments = this.getDefaultText();
                const followers = this.getDefaultText();
                const otherNames: any[] = [];

                return {
                    thumbnail: fullThumbnail,
                    title: this.getDefaultText(title),
                    href,
                    id,
                    isTrending,
                    shortDescription,
                    lastestChapters,
                    genres,
                    otherNames,
                    status,
                    totalViews,
                    totalComments,
                    followers,
                    updatedAt,
                    authors,
                    totalChapters
                };
            });

            return {
                comics,
                totalPages,
                currentPage: page,
                hasMorePages
            };
        } catch (err) {
            throw err;
        }
    }

    private getTotalChapterPages($: any): number {
        const lastPageLink = $(".paging a:contains('Cuối'), .paging a:contains('»')");
        if (lastPageLink.length > 0) {
            const onclick = lastPageLink.attr("onclick") || "";
            const match = onclick.match(/page\(\d+,\s*(\d+)\)/);
            if (match) return Number(match[1]);
        }

        const pageNumbers = $(".paging a")
            .map((_: any, el: any) => {
                const text = $(el).text().trim();
                const onclick = $(el).attr("onclick") || "";
                const m1 = text.match(/\d+/);
                const m2 = onclick.match(/page\(\d+,\s*(\d+)\)/);
                return m1 ? Number(m1[0]) : (m2 ? Number(m2[1]) : 0);
            })
            .get()
            .filter((n: any) => n > 1);

        return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
    }

    public async getChapters(parameters: {
        slug: string;
        id?: string;
        chapterPage?: number
    }): Promise<any[]> {
        const { slug, chapterPage = 1 } = parameters;

        try {
            const bookId = await this.getBookIdFromSlug(slug);
            if (!bookId) {
                console.warn("Không tìm thấy bookId cho slug:", slug);
                return [];
            }

            const url = `get/listchap/${bookId}?page=${chapterPage}`;
            const response = await this.createRequest(url, true);

            let htmlFragment: string;

            if (typeof response === 'string') {
                const json = JSON.parse(response);
                htmlFragment = json.data;
            } else {
                htmlFragment = response.data;
            }

            let decodedHtml = htmlFragment
                .replace(/\\u003C/g, '<')
                .replace(/\\u003E/g, '>')
                .replace(/\\u0027/g, "'")
                .replace(/\\u0022/g, '"')
                .replace(/\\u003D/g, '=')
                .replace(/\\u002F/g, '/')
                .replace(/\\u0026/g, '&')
                .replace(/\\\//g, '/');

            decodedHtml = htmlFragment.replace(/\\u([\dA-Fa-f]{4})/g, (match, grp) => {
                return String.fromCharCode(parseInt(grp, 16));
            });

            const $ = load(decodedHtml);

            const chapters = $('ul li a').map((_, el) => {
                const $el = $(el);
                const href = $el.attr('href') || '';
                const title = $el.text().trim();

                const chapterMatch = href.match(/chuong-(\d+)/i) || title.match(/Chương\s*(\d+)/i);
                const chapterNum = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;
                const chapterSlug = href.split('/').pop() || '';

                return {
                    id: chapterSlug,
                    name: title,
                    chapterNumber: chapterNum,
                    url: `${this.domain}/${href}`,
                    updatedAt: new Date().toISOString(),
                };
            }).get();
            return chapters;
        } catch (err) {
            console.error("Lỗi khi lấy chapters từ sstruyen.com.vn:", err);
            return [];
        }
    }

    public async getGenres(): Promise<any> {
        try {
            const $ = await this.createRequest("");

            const genreLinks: any[] = $(".menu-section a.dropdown:contains('THỂ LOẠI')")
                .closest('.menu-item-has-children')
                .find('.menu-subs.menu-mega a')
                .toArray();

            const genres = genreLinks?.map((item) => {
                const el = $(item);
                const href = el.attr("href") ?? "";
                const name = this.getDefaultText(el.text());
                const description = el.attr("title");

                return {
                    id: this.convertHrefToId(href, 2),
                    name,
                    description,
                    url: href
                };
            });

            return genres || [];
        } catch (err) {
            throw err;
        }
    }

    public async getRecommendStory(): Promise<any> {
        try {
            return await this.getStories("danh-sach/truyen-hot");
        } catch (err) {
            throw err;
        }
    }

    public async getRecentUpdateStory(): Promise<any> {
        try {
            const $ = await this.createRequest() as CheerioAPI;
            const comics = $('.main-wrapper .itemupdate').map((_, element) => {
                const $item = $(element);

                const titleLink = $item.find('.iname h3 a').first();
                const title = titleLink.text().trim().replace(/^\s*›\s*/, '').trim();
                const href = titleLink.attr('href')?.replace(/^\//, '') || '';
                const id = href.split('/').filter(Boolean)[0] || href;

                const genres = $item.find('.icate a').map((_, el) => {
                    const name = $(el).text().trim();
                    const genreHref = $(el).attr('href') || '';
                    const genreId = genreHref.replace('/the-loai/', '');
                    return { id: genreId, name };
                }).get();

                const chapterLink = $item.find('.ichapter a').first();
                const chapterText = chapterLink.text().trim();
                const totalChaptersMatch = chapterText.match(/(\d+)\s*chương/i);
                const totalChapters = totalChaptersMatch ? parseInt(totalChaptersMatch[1], 10) : 0;

                const latestChapterHref = chapterLink.attr('href') || '';
                const latestChapterId = latestChapterHref.split('/').pop() || '';

                const updatedAtText = $item.find('.iupdated').text().trim();

                const isFull = $item.find('.status .status-full').length > 0;
                const isNew = $item.find('.status .status-new').length > 0;
                const status = isFull ? 'Full' : 'Đang cập nhật';

                return {
                    id,
                    title,
                    href: href,
                    thumbnail: '',
                    fullThumbnail: '',
                    genres,
                    status,
                    isNew: isNew,
                    totalChapters,
                    latestChapter: {
                        name: chapterText,
                        href: latestChapterHref,
                        id: latestChapterId
                    },
                    updatedAt: updatedAtText,
                    authors: [],
                    otherNames: [],
                    shortDescription: '',
                    totalViews: 0,
                    followers: 0,
                    totalComments: 0,
                    isTrending: false,
                    isHot: false,
                    isCompleted: isFull
                };
            }).get();
            return {
                comics,
                currentPage: 1,
                totalPages: 1,
                hasMorePages: false,
            };

        } catch (error) {
            return {
                comics: [],
                currentPage: 1,
                totalPages: 1,
                hasMorePages: false,
            };
        };
    }

    public async getCompletedStory(page: number = 1): Promise<any> {
        try {
            return await this.getStories("/danh-sach/truyen-full", page);
        } catch (err) {
            throw err;
        }
    }

    public async getStoryByGenre(genreId: string, page: number = 1): Promise<any> {
        try {
            const path = `/the-loai/${genreId}`;
            return await this.getStories(path, page);
        } catch (err) {
            throw err;
        }
    }

    public async getTrendingStory(page: number = 1): Promise<any> {
        try {
            return await this.getStories("danh-sach/truyen-hot?page=2", page);
        } catch (err) {
            // throw err;
        }
    }

    public async searchStory(query: string, page: number = 1): Promise<any> {
        try {
            return await this.getStories(`tim-kiem?s=${query.replace(/\s+/g, "+")}&page=${page}`, page, true);
        } catch (err) {
            throw err;
        }
    }

    public async getStoryDetail(parameters: { slug: string, id?: string, chapterPage?: number }): Promise<any> {
        const { slug } = parameters;
        try {
            const [$, chapters] = await Promise.all<CheerioAPI>([
                this.createRequest(`${slug}/`),
                this.getChapters(parameters),
            ]);
            let totalChapterPages = this.getTotalChapterPages($);

            const title = $("h1[itemprop='name']").text() || $(".title").text();

            let thumbnail = $(".book-info-pic img").attr("src") ||
                $('meta[property="og:image"]').attr("content") ||
                $(".books img").attr("src") || '';

            thumbnail = thumbnail.startsWith("http") ? thumbnail : this.domain + thumbnail;

            const descriptionElem = $("#gioithieu div[itemprop='description']");
            const description = this.convertText(descriptionElem);

            const authors = $(".book-info-text li").filter((_, el) =>
                $(el).text().includes("Tác giả")
            ).find("a").map((_, el) => $(el).text()).get();

            const statusText = $(".label-status").text().trim();
            const status = this.getDefaultText(statusText);

            const genres = $(".book-info-text li.li--genres a").map((_, el) => {
                const href = $(el).attr("href") || "";
                const id = this.convertHrefToId(href, 2);
                const name = $(el).text();
                return { id, name };
            }).get();

            const otherNames: string[] = [];
            let totalViews = this.getDefaultText();;
            const viewText = $(".book-info-text li").filter((_, el) =>
                $(el).text().includes("Lượt xem")
            ).text();
            const viewMatch = viewText.match(/[\d,]+/);
            if (viewMatch) totalViews = viewMatch[0].replace(/,/g, "");
            const chapterCountText = $(".book-info-text li:contains('Số chương')").text();
            const chapterCountMatch = chapterCountText.match(/Số chương\D*(\d+)/i);
            const totalChapters = chapterCountMatch && Number(chapterCountMatch[1]);
            const ratingCount = this.getDefaultText($(".rate-holder").attr("data-score"));
            const average = this.getDefaultText($(".book-rating .rate_row_result").text().match(/\d+\.?\d*/)?.[0]);
            const followers = this.getDefaultText();
            const translators: string[] = [];
            const isAdult = false;

            return {
                title,
                thumbnail,
                description,
                authors,
                status,
                genres,
                totalViews,
                average,
                ratingCount,
                followers,
                chapters,
                id: slug,
                isAdult,
                otherNames,
                totalChapterPages,
                totalChapters,
                translators,
            };

        } catch (err) {
            console.error("Error crawling comic detail from sstruyen.com.vn:", err);
            throw err;
        }
    }

    public async getChapterContent(parameters: { slug: string, id: string, chapterPage?: number }): Promise<any> {
        const { slug, id } = parameters;
        try {
            const $ = await this.createRequest(`${slug}/${id}/`) as CheerioAPI;

            const pageTitle = $('title').text() ?? '';
            const chapterName = pageTitle.split(' - ').length > 1
                ? pageTitle.split(' - ')[1]
                : $("#chapter-big-container .chapter-title").text();

            const comicName = pageTitle.split(' - ').length > 1
                ? pageTitle.split(' - ')[0].replace(/ \(Full\)$/i, "")
                : $("#chapter-big-container .truyen-title").text() || $('script#recently_viewed').text().match(/"title":"([^"]+)"/)?.[1];

            const content = this.convertText($("#vungdoc .truyen"));
            const match = id.match(/chuong-(\d+)/i);
            const chapterNumber = match ? Number(match[1]) : 0;

            return {
                chapterName,
                comicName,
                content,
                chapters: [],
                chapterNumber
            };
        } catch (err) {
            console.error("Error crawling chapter from sstruyen.com.vn:", err);
            throw err;
        }
    }
}

const SSStory = new SSStoryApi();
export { SSStory };