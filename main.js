// 当读取对象属性时，把副作用函数放进桶里；当设置属性时，把副作用函数从桶里取出并执行
const bucket = new Set();
const data = { text: 'hello world' };
const obj = new Proxy(data, {
    get(target, key) {
        bucket.add(effect);
        return target[key];
    },
    set(target, key, value) {
        target[key] = value;
        bucket.forEach((fn) => fn());
        return true;
    }
})